#!/usr/bin/env node
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const host = "127.0.0.1"
const timeoutMs = Number(process.env.PRESS_SCREENSHOT_TIMEOUT_MS ?? 60_000)
const outputDir = path.join(rootDir, "public", "press")
const viewport = { width: 1440, height: 900 }
const fixedNow = new Date("2026-06-11T06:00:00.000Z")

function log(message) {
  process.stdout.write(`[press:screenshots] ${message}\n`)
}

function fail(message) {
  throw new Error(message)
}

async function findFreePort() {
  const server = createServer()
  server.listen(0, host)
  await once(server, "listening")
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : null
  server.close()
  await once(server, "close")
  if (!port) fail("Could not allocate a local port")
  return port
}

async function waitForHttp(url, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await delay(500)
  }
  fail(`Timed out waiting for ${url}`)
}

function existingDevServerUrl(output, attemptedBaseUrl) {
  const matches = [...output.matchAll(/\bLocal:\s+(https?:\/\/[^\s]+)/g)].map((match) => match[1])
  return matches.reverse().find((url) => url !== attemptedBaseUrl) ?? null
}

async function startDevServer() {
  const port = await findFreePort()
  const baseUrl = `http://${host}:${port}`
  const nextBin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next")
  const child = spawn(nextBin, ["dev", "-H", host, "-p", String(port)], {
    cwd: rootDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    output += chunk.toString()
  })

  const exitPromise = once(child, "exit").then(() => "exit")
  const readyPromise = waitForHttp(baseUrl, timeoutMs).then(() => "ready")
  const firstState = await Promise.race([exitPromise, readyPromise])

  if (firstState === "exit") {
    await delay(250)
    const existingUrl = existingDevServerUrl(output, baseUrl)
    if (existingUrl) {
      await waitForHttp(existingUrl, timeoutMs)
      log(`using existing Next dev server at ${existingUrl}`)
      return { baseUrl: existingUrl, stop: async () => {} }
    }
    process.stderr.write(output)
    fail("Next dev server exited before it became reachable")
  }

  await delay(750)
  if (child.exitCode !== null) {
    const existingUrl = existingDevServerUrl(output, baseUrl)
    if (existingUrl) {
      await waitForHttp(existingUrl, timeoutMs)
      log(`using existing Next dev server at ${existingUrl}`)
      return { baseUrl: existingUrl, stop: async () => {} }
    }
    process.stderr.write(output)
    fail("Next dev server exited after startup")
  }

  return {
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return
      child.kill("SIGTERM")
      await Promise.race([once(child, "exit"), delay(5_000).then(() => child.kill("SIGKILL"))])
    },
  }
}

async function installScreenshotState(context, theme) {
  await context.addInitScript((selectedTheme) => {
    window.localStorage.setItem("theme", selectedTheme)
    window.localStorage.setItem("hasSeenOnboarding", "1")
    window.localStorage.setItem("hasDismissedNotificationSetup", "1")
    window.sessionStorage.setItem("tickward:project-claim-dismissed:demo_big_days", "1")
  }, theme)
}

async function installRoutes(page) {
  await page.route("https://api.github.com/repos/CorgiCorner/tickward", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stargazers_count: 42 }),
    })
  })
  await page.route("**/api/auth/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session: null, user: null }),
    })
  })
  await page.route("**/api/projects/restore?*", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_found", messageKey: "errors.notFound" } }),
    })
  })
  await page.route("**/api/projects/save", async (route) => {
    const payload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, project: payload.project }),
    })
  })
  await page.route("**/api/share/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ shareId: null, url: null }),
    })
  })
  // The demo seed contains one followed shared timer; without a database the
  // share endpoints would 500 and trip the browser-error assertion.
  await page.route("**/api/share/resolve-batch", async (route) => {
    const payload = route.request().postDataJSON()
    const ids = Array.isArray(payload?.ids) ? payload.ids : []
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: ids.map((id) => ({ id, status: "ok", timer: {} })) }),
    })
  })
  await page.route("**/api/share/resolve?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ timer: {} }),
    })
  })
}

function collectBrowserErrors(page) {
  const browserErrors = []
  page.on("console", (message) => {
    if (message.type() !== "error") return
    if (message.text().startsWith("Failed to load resource:")) return
    browserErrors.push(message.text())
  })
  page.on("pageerror", (error) => browserErrors.push(error.message))
  page.on("response", (response) => {
    const status = response.status()
    if (status < 400) return
    const url = response.url()
    if (status === 404 && url.includes("/api/projects/restore")) return
    browserErrors.push(`HTTP ${status} ${url}`)
  })
  page.on("requestfailed", (request) => {
    if (isIgnorableRequestFailure(request)) return
    browserErrors.push(`${request.failure()?.errorText ?? "request_failed"} ${request.url()}`)
  })
  return browserErrors
}

function isIgnorableRequestFailure(request) {
  const errorText = request.failure()?.errorText
  if (errorText !== "net::ERR_ABORTED") return false

  try {
    return new URL(request.url()).searchParams.has("_rsc")
  } catch {
    return false
  }
}

async function assertNoBrowserErrors(browserErrors) {
  if (browserErrors.length === 0) return
  fail(`Browser errors:\n${browserErrors.map((error) => `- ${error}`).join("\n")}`)
}

async function waitForDemoToastToClear(page) {
  const toast = page.getByText("Demo project loaded.")
  await toast.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {})
  await toast.waitFor({ state: "hidden", timeout: 7_000 })
}

async function captureTheme(browser, baseUrl, theme, fileName) {
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport,
    deviceScaleFactor: 2,
  })
  await installScreenshotState(context, theme)
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const browserErrors = collectBrowserErrors(page)
  await installRoutes(page)

  try {
    await page.clock.setFixedTime(fixedNow)
    await page.goto("/demo", { waitUntil: "networkidle" })
    await page.waitForFunction((selectedTheme) => document.documentElement.classList.contains(selectedTheme), theme)
    await page.getByRole("button", { name: "Load demo project" }).click()
    await page.getByRole("button", { name: "Loaded" }).waitFor({ state: "visible", timeout: 10_000 })
    await waitForDemoToastToClear(page)

    await page.goto("/", { waitUntil: "networkidle" })
    // The pinned demo timer renders more than once (pinned strip + list) and
    // some copies stay hidden; wait on the first visible match.
    await page
      .getByText("Flight to Lisbon")
      .filter({ visible: true })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
    await waitForDemoToastToClear(page)

    const screenshotPath = path.join(outputDir, fileName)
    await page.screenshot({
      path: screenshotPath,
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    })
    await assertNoBrowserErrors(browserErrors)
    log(`wrote ${path.relative(rootDir, screenshotPath)}`)
  } finally {
    await context.close()
  }
}

let devServer
let browser
let exitCode = 0
try {
  await mkdir(outputDir, { recursive: true })
  devServer = await startDevServer()
  log(`running against ${devServer.baseUrl}`)

  browser = await chromium.launch({ headless: true })
  await captureTheme(browser, devServer.baseUrl, "light", "screenshot-timers-light.png")
  await captureTheme(browser, devServer.baseUrl, "dark", "screenshot-timers-dark.png")

  log("passed")
} catch (error) {
  exitCode = 1
  console.error(error)
} finally {
  await browser?.close()
  await devServer?.stop()
  process.exit(exitCode)
}

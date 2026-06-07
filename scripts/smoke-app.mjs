#!/usr/bin/env node
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"
import { setTimeout as delay } from "node:timers/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const host = "127.0.0.1"
const externalBaseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "")
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 60_000)

function log(message) {
  process.stdout.write(`[smoke] ${message}\n`)
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

async function expectVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 10_000 })
  if (!(await locator.isVisible())) fail(`${label} is not visible`)
}

async function assertNoBrowserErrors(errors) {
  if (errors.length === 0) return
  fail(`Browser errors:\n${errors.map((error) => `- ${error}`).join("\n")}`)
}

async function runSmoke(baseUrl) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 390, height: 844 },
    permissions: ["clipboard-read", "clipboard-write"],
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const browserErrors = []
  const shareRequests = []

  try {
    page.on("console", (message) => {
      if (message.type() !== "error") return
      // Fetch 404s surface as generic console resource errors in Chromium.
      // URL-level failures are tracked through the response/request handlers.
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
      browserErrors.push(`${request.failure()?.errorText ?? "request_failed"} ${request.url()}`)
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
    await page.route("**/api/share/create", async (route) => {
      shareRequests.push(route.request().postDataJSON())
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ shareId: "timer_smoke-share", url: "/share/timer_smoke-share" }),
      })
    })

    await page.goto("/", { waitUntil: "networkidle" })
    await expectVisible(page.getByPlaceholder("Timer name"), "quick add")
    await assertNoBrowserErrors(browserErrors)
    log("home loaded without browser errors")

    await page.getByPlaceholder("Timer name").fill("Smoke launch")
    await page.getByRole("button", { name: "Add", exact: true }).click()
    await expectVisible(page.getByText("Smoke launch", { exact: true }).first(), "created timer")
    log("quick add created a timer")

    await page.getByRole("button", { name: "Switch project" }).click()
    await page.getByRole("button", { name: "Settings" }).click()
    const settingsDialog = page.getByRole("dialog", { name: "Settings" })
    await expectVisible(settingsDialog, "settings dialog")
    const scroller = page.locator('[data-slot="settings-scroll-container"]')
    const dimensions = await scroller.evaluate((node) => ({
      scrollTop: node.scrollTop,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }))
    if (dimensions.scrollHeight <= dimensions.clientHeight) {
      fail(`Settings body is not scrollable: ${JSON.stringify(dimensions)}`)
    }
    await settingsDialog.evaluate((node) => {
      node.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 220 }))
    })
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-slot="settings-scroll-container"]')
      return node instanceof HTMLElement && node.scrollTop > 0
    })
    await page.keyboard.press("Escape")
    await settingsDialog.waitFor({ state: "hidden" })
    log("settings body scrolls from dialog wheel events")

    const shareButton = page.locator('button[aria-label="Share"]').filter({ visible: true }).first()
    await shareButton.scrollIntoViewIfNeeded()
    await shareButton.click()
    const shareDialog = page.getByRole("dialog", { name: "Share" })
    await expectVisible(shareDialog, "share dialog")
    await page.getByRole("button", { name: "Create link" }).click()
    const shareUrlInput = shareDialog.locator("input[readonly]")
    await expectVisible(shareUrlInput, "share URL")
    const shareUrl = await shareUrlInput.inputValue()
    if (shareUrl !== `${baseUrl}/share/timer_smoke-share`) fail(`Unexpected share URL: ${shareUrl}`)
    if (shareRequests.length !== 1) fail(`Expected one share request, got ${shareRequests.length}`)
    if (typeof shareRequests[0]?.owner?.timerId !== "string" || shareRequests[0].owner.timerId.length === 0) {
      fail("Share request did not include the timer owner")
    }
    log("share flow creates a copyable link")

    await assertNoBrowserErrors(browserErrors)
  } finally {
    await browser.close()
  }
}

let devServer
let exitCode = 0
try {
  devServer = externalBaseUrl ? null : await startDevServer()
  const baseUrl = externalBaseUrl ?? devServer.baseUrl
  log(`running against ${baseUrl}`)
  if (externalBaseUrl) await waitForHttp(baseUrl, timeoutMs)
  await runSmoke(baseUrl)
  log("passed")
} catch (error) {
  exitCode = 1
  console.error(error)
} finally {
  await devServer?.stop()
  process.exit(exitCode)
}

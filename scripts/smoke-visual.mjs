#!/usr/bin/env node
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { chromium, webkit } from "playwright"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const host = "127.0.0.1"
const externalBaseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "")
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 60_000)
const screenshotDir = process.env.SMOKE_VISUAL_DIR ?? "/tmp/tickward-visual-smoke"
const expectedDocsHref = process.env.SMOKE_EXPECT_DOCS_HREF ?? "/docs"
const mobileViewport = { width: 390, height: 844 }

function log(message) {
  process.stdout.write(`[smoke:visual] ${message}\n`)
}

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
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

function makeProjectSeed(projectName, payloadOverrides = {}) {
  const now = new Date().toISOString()
  const projectId = `visual_${Math.random().toString(36).slice(2, 10)}`
  const restoreKey = `visual_${Math.random().toString(36).slice(2, 18)}`
  const timers = payloadOverrides.timers ?? []
  const spaces = payloadOverrides.spaces ?? []
  const project = {
    id: projectId,
    name: projectName.slice(0, 40),
    restoreKey,
    color: "#2563eb",
    createdAt: now,
    updatedAt: now,
    timerCount: timers.length,
    spaceCount: spaces.length,
  }
  return {
    activeProjectId: projectId,
    payload: {
      timers,
      spaces,
      activeSpaceId: null,
      sortMode: "soonest",
      timerFilters: { notifications: false, shared: false },
      updatedAt: now,
    },
    project,
  }
}

async function installProjectSeed(context, projectName, payloadOverrides = {}) {
  const seed = makeProjectSeed(projectName, payloadOverrides)
  await context.addInitScript((projectSeed) => {
    window.localStorage.setItem("td_projects_v1", JSON.stringify([projectSeed.project]))
    window.localStorage.setItem("td_active_project_v1", projectSeed.activeProjectId)
    window.localStorage.setItem(
      `td_project_payload:${projectSeed.activeProjectId}`,
      JSON.stringify(projectSeed.payload),
    )
    window.localStorage.setItem("hasSeenOnboarding", "1")
    window.localStorage.setItem("hasDismissedNotificationSetup", "1")
  }, seed)
  return seed
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

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    rootClientWidth: document.documentElement.clientWidth,
    viewportWidth: window.innerWidth,
  }))
  assert(
    metrics.bodyScrollWidth <= metrics.viewportWidth + 1 && metrics.rootScrollWidth <= metrics.viewportWidth + 1,
    `${label} has horizontal overflow: ${JSON.stringify(metrics)}`,
  )
}

async function assertMobileInputs(page, label) {
  const metrics = await page.evaluate(() => {
    const name = document.querySelector('input[placeholder="Timer name"]')
    const date = document.querySelector('input[type="date"]')
    const time = document.querySelector('input[type="time"]')
    if (!(name instanceof HTMLElement) || !(date instanceof HTMLElement) || !(time instanceof HTMLElement)) {
      return null
    }
    const inputMetrics = (node) => {
      const rect = node.getBoundingClientRect()
      const styles = getComputedStyle(node)
      return {
        alignItems: styles.alignItems,
        display: styles.display,
        height: rect.height,
        lineHeight: styles.lineHeight,
        paddingBottom: styles.paddingBottom,
        paddingTop: styles.paddingTop,
      }
    }
    return {
      date: inputMetrics(date),
      name: inputMetrics(name),
      time: inputMetrics(time),
    }
  })
  assert(metrics, `${label} could not find quick-add inputs`)
  for (const inputName of ["date", "name", "time"]) {
    const height = metrics[inputName].height
    assert(height >= 35 && height <= 37, `${label} ${inputName} input height is ${height}, expected h-9`)
  }
}

async function assertHeader(page, projectName) {
  const trigger = page.locator(".project-switcher-trigger")
  await trigger.waitFor({ state: "visible", timeout: 10_000 })
  const title = await trigger.getAttribute("title")
  assert(title === projectName.slice(0, 40), `Project switcher title was ${title}`)

  const addButton = page.getByRole("button", { name: "Add new" })
  await addButton.waitFor({ state: "visible", timeout: 10_000 })
  assert((await addButton.getAttribute("data-variant")) === "outline", "Header add button should use outline variant")

  const rect = await trigger.boundingBox()
  assert(rect && rect.width > 0, "Project switcher trigger has no measurable width")
  if (projectName === "main") {
    assert(rect.width <= 110, `Short project name trigger is too wide: ${rect.width}`)
  }
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: true })
}

async function openSeededHome(browserType, baseUrl, projectName) {
  const browser = await browserType.launch({ headless: true })
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: mobileViewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await installProjectSeed(context, projectName)
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const browserErrors = collectBrowserErrors(page)
  await installRoutes(page)
  await page.goto("/", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Add new" }).waitFor({ state: "visible", timeout: 10_000 })
  return { browser, browserErrors, page }
}

async function runMobileHomeSmoke(browserType, browserName, baseUrl, projectName, screenshotName) {
  const { browser, browserErrors, page } = await openSeededHome(browserType, baseUrl, projectName)
  try {
    await assertHeader(page, projectName)
    await assertMobileInputs(page, `${browserName} ${projectName}`)
    await assertNoHorizontalOverflow(page, `${browserName} ${projectName}`)
    await screenshot(page, screenshotName)
    await assertNoBrowserErrors(browserErrors)
    log(`${browserName} mobile home passed for "${projectName}"`)
  } finally {
    await browser.close()
  }
}

async function runMobileFooterSmoke(baseUrl) {
  const { browser, browserErrors, page } = await openSeededHome(chromium, baseUrl, "main")
  try {
    const docsLink = page.getByRole("link", { name: "Docs" })
    await docsLink.scrollIntoViewIfNeeded()
    await docsLink.waitFor({ state: "visible", timeout: 10_000 })
    const href = await docsLink.getAttribute("href")
    assert(href === expectedDocsHref, `Expected footer Docs link to point to ${expectedDocsHref}, got ${href}`)
    await assertNoHorizontalOverflow(page, "mobile footer")
    await screenshot(page, "chromium-mobile-footer.png")
    await assertNoBrowserErrors(browserErrors)
    log("mobile footer docs link passed")
  } finally {
    await browser.close()
  }
}

async function runSettingsSmoke(baseUrl) {
  const { browser, browserErrors, page } = await openSeededHome(chromium, baseUrl, "main")
  try {
    await page.getByRole("button", { name: "Switch project" }).click()
    await page.waitForTimeout(350)
    const tooltips = await page.getByRole("tooltip").allTextContents()
    assert(
      !tooltips.some((tooltip) => tooltip.includes("Settings")),
      `Project switcher opened the settings tooltip before hover: ${JSON.stringify(tooltips)}`,
    )

    await page.getByRole("button", { name: "Project settings" }).click()
    const dialog = page.getByRole("dialog", { name: "Project settings" })
    await dialog.waitFor({ state: "visible", timeout: 10_000 })
    const activeId = await page.evaluate(() =>
      document.activeElement instanceof HTMLElement ? document.activeElement.id : "",
    )
    assert(activeId !== "projectName", "Project name input should not be auto-focused when settings opens")

    const scroller = page.locator('[data-slot="settings-scroll-container"]')
    const dimensions = await scroller.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    }))
    assert(
      dimensions.scrollHeight > dimensions.clientHeight,
      `Settings body is not scrollable: ${JSON.stringify(dimensions)}`,
    )
    const scrollTopAfterProgrammaticScroll = await scroller.evaluate((node) => {
      node.scrollTop = 0
      node.scrollTop = 260
      return node.scrollTop
    })
    assert(scrollTopAfterProgrammaticScroll > 0, "Settings body did not accept scrollTop changes")

    await screenshot(page, "chromium-settings.png")
    await assertNoBrowserErrors(browserErrors)
    log("settings focus and scroll passed")
  } finally {
    await browser.close()
  }
}

async function runSignInEmailSmoke(baseUrl) {
  const browser = await webkit.launch({ headless: true })
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: mobileViewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const browserErrors = collectBrowserErrors(page)
  await installRoutes(page)

  try {
    await page.goto("/sign-in", { waitUntil: "networkidle" })
    const email = page.locator("#auth-email")
    await email.waitFor({ state: "visible", timeout: 10_000 })
    const attributes = await email.evaluate((input) => ({
      autocomplete: input.getAttribute("autocomplete"),
      formAutocomplete: input.closest("form")?.getAttribute("autocomplete"),
      inputMode: input.getAttribute("inputmode"),
      name: input.getAttribute("name"),
      type: input.getAttribute("type"),
    }))
    assert(attributes.type === "email", `Expected email input type, got ${attributes.type}`)
    assert(attributes.inputMode === "email", `Expected email inputmode, got ${attributes.inputMode}`)
    assert(attributes.autocomplete === "off", `Expected autocomplete=off, got ${attributes.autocomplete}`)
    assert(attributes.formAutocomplete === "off", `Expected form autocomplete=off, got ${attributes.formAutocomplete}`)
    assert(attributes.name === "email-code-address", `Expected neutral email field name, got ${attributes.name}`)

    await screenshot(page, "webkit-sign-in-email.png")
    await assertNoBrowserErrors(browserErrors)
    log("webkit sign-in email field passed")
  } finally {
    await browser.close()
  }
}

async function runUnsplashSpacingSmoke(baseUrl) {
  const { browser, browserErrors, page } = await openSeededHome(chromium, baseUrl, "main")
  try {
    await page.getByRole("button", { name: "Add new" }).click()
    const dialog = page.getByRole("dialog", { name: "New timer" })
    await dialog.waitFor({ state: "visible", timeout: 10_000 })
    await dialog.getByLabel("Label").fill("Visual smoke timer")
    await dialog.getByRole("button", { name: "Next" }).click()
    await dialog.locator('input[type="date"]').fill("2030-06-06")
    await dialog.locator('input[type="time"]').fill("09:00")
    await dialog.getByRole("button", { name: "Next" }).click()
    await dialog.getByRole("button", { name: "Add photo" }).click()

    const spacing = await page.evaluate(() => {
      const description = document.querySelector('[data-slot="popover-description"]')
      const input = document.querySelector('input[placeholder="Search photos..."]')
      if (!(description instanceof HTMLElement) || !(input instanceof HTMLElement)) return null
      return input.getBoundingClientRect().top - description.getBoundingClientRect().bottom
    })
    assert(spacing !== null, "Unsplash popover description or search input was not found")
    assert(spacing >= 10, `Unsplash search input is too close to the description: ${spacing}px`)

    await screenshot(page, "chromium-unsplash-popover.png")
    await assertNoBrowserErrors(browserErrors)
    log("unsplash popover spacing passed")
  } finally {
    await browser.close()
  }
}

async function runEditTimezoneSmoke(baseUrl) {
  const now = new Date().toISOString()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 900, height: 900 },
  })
  await installProjectSeed(context, "main", {
    timers: [
      {
        id: "timer_edit_smoke",
        label: "Timezone smoke",
        targetDate: "2030-06-06T10:00:00.000Z",
        timezone: "Europe/Warsaw",
        createdAt: now,
        updatedAt: now,
      },
    ],
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const browserErrors = collectBrowserErrors(page)
  await installRoutes(page)

  try {
    await page.goto("/", { waitUntil: "networkidle" })
    const desktopCard = page.locator(".hidden.md\\:block", { hasText: "Timezone smoke" }).first()
    await desktopCard.waitFor({ state: "visible", timeout: 10_000 })
    await desktopCard.hover()
    const editButton = desktopCard.locator('button[aria-label="Edit timer"]').first()
    await editButton.waitFor({ state: "visible", timeout: 10_000 })
    await editButton.hover()
    await editButton.click()
    await page.getByText("Edit", { exact: true }).waitFor({ state: "hidden", timeout: 10_000 })

    const dialog = page.getByRole("dialog", { name: "Edit timer" })
    await dialog.waitFor({ state: "visible", timeout: 10_000 })
    await dialog.getByRole("button", { name: "Next" }).click()
    await dialog.getByRole("button", { name: /Europe\/Warsaw/ }).click()
    await page.getByPlaceholder("Search timezones...").waitFor({ state: "visible", timeout: 10_000 })

    const list = page.locator('[data-slot="command-list"]')
    const dimensions = await list.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    }))
    assert(
      dimensions.scrollHeight > dimensions.clientHeight,
      `Timezone list is not scrollable: ${JSON.stringify(dimensions)}`,
    )
    await list.hover()
    await page.mouse.wheel(0, 260)
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-slot="command-list"]')
      return node instanceof HTMLElement && node.scrollTop > 0
    })

    await screenshot(page, "chromium-edit-timezone.png")
    await assertNoBrowserErrors(browserErrors)
    log("edit timezone popover passed")
  } finally {
    await browser.close()
  }
}

let devServer
let exitCode = 0
try {
  await mkdir(screenshotDir, { recursive: true })
  devServer = externalBaseUrl ? null : await startDevServer()
  const baseUrl = externalBaseUrl ?? devServer.baseUrl
  log(`running against ${baseUrl}`)
  if (externalBaseUrl) await waitForHttp(baseUrl, timeoutMs)

  await runMobileHomeSmoke(chromium, "chromium", baseUrl, "main", "chromium-mobile-main.png")
  await runMobileHomeSmoke(
    chromium,
    "chromium",
    baseUrl,
    "A very long project name for mobile headers",
    "chromium-mobile-long-project.png",
  )
  await runMobileHomeSmoke(webkit, "webkit", baseUrl, "main", "webkit-mobile-main.png")
  await runMobileFooterSmoke(baseUrl)
  await runSettingsSmoke(baseUrl)
  await runSignInEmailSmoke(baseUrl)
  await runUnsplashSpacingSmoke(baseUrl)
  await runEditTimezoneSmoke(baseUrl)

  log(`screenshots written to ${screenshotDir}`)
  log("passed")
} catch (error) {
  exitCode = 1
  console.error(error)
} finally {
  await devServer?.stop()
  process.exit(exitCode)
}

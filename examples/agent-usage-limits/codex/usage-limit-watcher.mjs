// Polls `codex app-server` for account rate limits and creates a tickward
// countdown that ends when a nearly-exhausted Codex usage window resets.
// Run it from cron or launchd every ~5 minutes; reruns dedupe by timer id.

import { spawn } from "node:child_process"
import { accessSync, constants, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const BASE_URL = process.env.TICKWARD_BASE_URL ?? ""
const API_KEY = process.env.TICKWARD_API_KEY ?? ""
const PROJECT_ID = process.env.TICKWARD_PROJECT_ID ?? ""
const REMINDER_MINUTES = Number(process.env.TICKWARD_REMINDER_MINUTES ?? 10)
const USAGE_THRESHOLD = Number(process.env.TICKWARD_USAGE_THRESHOLD ?? 80)
const DRY_RUN = process.env.TICKWARD_DRY_RUN === "1" || process.env.TICKWARD_DRY_RUN === "true"
const APP_SERVER_TIMEOUT_MS = 10_000
const FETCH_TIMEOUT_MS = 10_000
const WEEK_MINUTES = 7 * 24 * 60

function trustedDirectory(directory) {
  const uid = typeof process.getuid === "function" ? process.getuid() : null
  try {
    let current = realpathSync(directory)
    while (true) {
      const stats = statSync(current)
      if (!stats.isDirectory()) return false
      if (uid !== null && stats.uid !== 0 && stats.uid !== uid) return false
      if ((stats.mode & 0o022) !== 0) return false
      const parent = path.dirname(current)
      if (parent === current) return true
      current = parent
    }
  } catch {
    return false
  }
}

function trustedExecutable(candidate) {
  if (!path.isAbsolute(candidate)) return null
  try {
    accessSync(candidate, constants.X_OK)
    const resolved = realpathSync(candidate)
    if (!statSync(resolved).isFile()) return null
    return trustedDirectory(path.dirname(candidate)) && trustedDirectory(path.dirname(resolved)) ? resolved : null
  } catch {
    return null
  }
}

export function resolveCodexExecutable({
  configuredExecutable = process.env.CODEX_EXECUTABLE ?? "",
  pathValue = process.env.PATH ?? "",
} = {}) {
  const configured = configuredExecutable ? trustedExecutable(configuredExecutable) : null
  if (configured) return configured
  if (configuredExecutable) {
    throw new Error("CODEX_EXECUTABLE must be an executable absolute path in a trusted directory")
  }

  const candidates = pathValue
    .split(path.delimiter)
    .filter((directory) => path.isAbsolute(directory) && trustedDirectory(directory))
    .map((directory) => path.join(directory, process.platform === "win32" ? "codex.exe" : "codex"))
  for (const candidate of candidates) {
    const resolved = trustedExecutable(candidate)
    if (resolved) return resolved
  }
  throw new Error("codex was not found in a trusted executable directory; set CODEX_EXECUTABLE")
}

// Spawns `codex app-server`, speaks JSON-RPC 2.0 over its stdio
// (initialize -> account/rateLimits/read), and kills the child as soon as
// the rate-limit response arrives or the timeout fires.
function readRateLimits() {
  return new Promise((resolve, reject) => {
    const codexExecutable = resolveCodexExecutable()
    const child = spawn(codexExecutable, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] })
    let settled = false
    const finish = (settle, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.kill()
      settle(value)
    }
    const timeout = setTimeout(
      () => finish(reject, new Error("codex app-server did not respond within 10s")),
      APP_SERVER_TIMEOUT_MS,
    )

    let buffer = ""
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8")
      let newline
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        let message
        try {
          message = JSON.parse(line)
        } catch {
          continue // not a JSON-RPC line - skip
        }
        if (message?.id === 1) {
          // The app-server rejects further requests until the client
          // acknowledges initialize with an `initialized` notification.
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} })}\n`)
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "account/rateLimits/read" })}\n`)
        } else if (message?.id === 2) {
          if (message.error) {
            finish(reject, new Error(`rate-limit read failed: ${message.error.message ?? "unknown error"}`))
          } else {
            finish(resolve, message.result ?? {})
          }
        }
      }
    })
    child.on("error", (error) => finish(reject, error))
    child.on("exit", () => finish(reject, new Error("codex app-server exited before responding")))

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "tickward-usage-limit-watcher", version: "1.0.0" } },
      })}\n`,
    )
  })
}

function toWindow(key, data) {
  if (!data || typeof data !== "object") return null
  const usedPercent =
    typeof data.usedPercent === "number" && Number.isFinite(data.usedPercent) ? data.usedPercent : null
  const resetsAt =
    typeof data.resetsAt === "number" && Number.isFinite(data.resetsAt) && data.resetsAt * 1000 > Date.now()
      ? data.resetsAt
      : null
  const durationMins =
    typeof data.windowDurationMins === "number" && Number.isFinite(data.windowDurationMins)
      ? data.windowDurationMins
      : null
  if (resetsAt === null) return null
  return { key, usedPercent, resetsAt, durationMins }
}

function extractWindows(result) {
  const windows = []
  const pushSnapshot = (snapshot, prefix = "") => {
    if (!snapshot || typeof snapshot !== "object") return
    for (const key of ["primary", "secondary"]) {
      const window = toWindow(prefix ? `${prefix}-${key}` : key, snapshot[key])
      if (window) windows.push(window)
    }
  }
  const byLimitId = result?.rateLimitsByLimitId
  if (byLimitId && typeof byLimitId === "object") {
    for (const [limitId, snapshot] of Object.entries(byLimitId)) {
      const before = windows.length
      pushSnapshot(snapshot, limitId)
      if (windows.length === before) {
        // Some shapes keep the window right under the limit id; only fall back
        // to that reading when no primary/secondary sub-windows were found,
        // otherwise the same reset would yield two timers with different ids.
        const direct = toWindow(limitId, snapshot)
        if (direct) windows.push(direct)
      }
    }
  }
  // Top-level rateLimits often repeats the same windows from an older snapshot
  // (with drifted resetsAt), which produced duplicate timers in the field.
  // Only fall back to it when rateLimitsByLimitId yielded nothing.
  if (windows.length === 0) pushSnapshot(result?.rateLimits)
  return freshestPerDuration(windows)
}

// The response can carry the same usage window several times (per-limit
// entries where one snapshot is stale). A sliding window's resetsAt only
// moves forward, so per window duration the latest resetsAt is the live one.
function freshestPerDuration(windows) {
  const byDuration = new Map()
  for (const window of windows) {
    const key = window.durationMins !== null ? String(window.durationMins) : window.key
    const existing = byDuration.get(key)
    if (!existing || window.resetsAt > existing.resetsAt) byDuration.set(key, window)
  }
  return [...byDuration.values()]
}

// Current tickward servers scope timer ids per project, but older
// deployments used globally unique ids. The short project-derived suffix
// keeps deterministic ids collision-free everywhere.
const ID_SUFFIX = PROJECT_ID.replace(/[^A-Za-z0-9_-]/g, "").slice(-6)

function timerId(window) {
  const part = window.durationMins !== null ? String(window.durationMins) : window.key
  const suffix = ID_SUFFIX ? `-${ID_SUFFIX}` : ""
  return `cdx-${part}-${window.resetsAt}${suffix}`.replace(/[^A-Za-z0-9_-]/g, "-")
}

function timerLabel(window) {
  if (window.durationMins !== null) {
    if (window.durationMins >= WEEK_MINUTES) return "Codex weekly limit resets"
    if (window.durationMins % 60 === 0) return `Codex limit resets (${window.durationMins / 60}h window)`
    return `Codex limit resets (${window.durationMins}m window)`
  }
  return window.key.includes("secondary") ? "Codex weekly limit resets" : "Codex limit resets"
}

// Dry-run mode never POSTs; it verifies credentials once per process with a
// read-only request and then only prints what it would have created.
let dryRunProbe = null

function probeCredentials() {
  dryRunProbe ??= (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(`${BASE_URL}/api/v1/projects/${PROJECT_ID}/timers?limit=1`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
        signal: controller.signal,
      })
      return response.status
    } finally {
      clearTimeout(timeout)
    }
  })()
  return dryRunProbe
}

// Returns true when the timer exists after the call (created now or earlier).
async function createTimer({ id, label, resetsAt }) {
  if (DRY_RUN) {
    const status = await probeCredentials()
    if (status !== 200) {
      process.stderr.write(`[tickward] dry-run: credential probe failed with HTTP ${status}\n`)
      return false
    }
    process.stdout.write(
      `[tickward] dry-run: would create timer ${id} "${label}" (resets ${new Date(resetsAt * 1000).toISOString()})\n`,
    )
    return true
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE_URL}/api/v1/projects/${PROJECT_ID}/timers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": id,
      },
      body: JSON.stringify({
        id,
        label,
        target_date: new Date(resetsAt * 1000).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notify: true,
        reminders: [{ offset_minutes: REMINDER_MINUTES }],
        description: "Auto-created because the usage window was nearly exhausted.",
      }),
      signal: controller.signal,
    })
    if (response.status === 201) return true
    const body = await response.text()
    // Duplicate client id => the timer for this reset window already exists.
    if (response.status === 400 && body.includes("already exists")) return true
    if (response.status === 409) return true
    process.stderr.write(`[tickward] timer ${id}: HTTP ${response.status} ${body.slice(0, 200)}\n`)
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const required = [
    ["TICKWARD_BASE_URL", BASE_URL],
    ["TICKWARD_API_KEY", API_KEY],
    ["TICKWARD_PROJECT_ID", PROJECT_ID],
  ]
  for (const [name, value] of required) {
    if (!value) {
      process.stderr.write(`[tickward] ${name} is not set\n`)
      process.exitCode = 1
      return
    }
  }

  const result = await readRateLimits()
  const limitReached = Boolean(result?.rateLimitReachedType)
  const seen = new Set()
  let failures = 0

  for (const window of extractWindows(result)) {
    if (!limitReached && (window.usedPercent === null || window.usedPercent < USAGE_THRESHOLD)) continue
    const id = timerId(window)
    if (seen.has(id)) continue
    seen.add(id)
    const ok = await createTimer({ id, label: timerLabel(window), resetsAt: window.resetsAt })
    if (!ok) {
      failures += 1
    } else if (!DRY_RUN) {
      // Dry-run already printed its own "would create" line.
      console.log(`[tickward] timer ${id} ready (resets ${new Date(window.resetsAt * 1000).toISOString()})`)
    }
  }

  process.exitCode = failures > 0 ? 1 : 0
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`[tickward] ${error?.message ?? error}\n`)
    process.exitCode = 1
  }
}

// Creates a tickward countdown that ends when your Claude Code usage limit
// resets, with a reminder before the reset. Reads one JSON document from
// stdin: wire it as a statusline command (default) or a StopFailure hook.

import { readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const BASE_URL = process.env.TICKWARD_BASE_URL ?? ""
const API_KEY = process.env.TICKWARD_API_KEY ?? ""
const PROJECT_ID = process.env.TICKWARD_PROJECT_ID ?? ""
const REMINDER_MINUTES = Number(process.env.TICKWARD_REMINDER_MINUTES ?? 10)
const USAGE_THRESHOLD = Number(process.env.TICKWARD_USAGE_THRESHOLD ?? 80)
const DRY_RUN = process.env.TICKWARD_DRY_RUN === "1" || process.env.TICKWARD_DRY_RUN === "true"
const FETCH_TIMEOUT_MS = 3000

// Current tickward servers scope timer ids per project, but older
// deployments used globally unique ids. The short project-derived suffix
// keeps deterministic ids collision-free everywhere.
const ID_SUFFIX = PROJECT_ID.replace(/[^A-Za-z0-9_-]/g, "").slice(-6)

function timerId(prefix, resetsAt) {
  return ID_SUFFIX ? `${prefix}-${resetsAt}-${ID_SUFFIX}` : `${prefix}-${resetsAt}`
}

const WINDOWS = [
  { key: "five_hour", idPrefix: "cc-5h", label: "Claude Code 5h limit resets", shortName: "5h" },
  { key: "seven_day", idPrefix: "cc-7d", label: "Claude Code weekly limit resets", shortName: "7d" },
]

// The statusline runs every few seconds; once a timer is known to exist we
// remember its id here so later refreshes skip the network round-trip.
const STATE_FILE = join(tmpdir(), "tickward-usage-limit-hook.json")

function readEnsuredIds() {
  try {
    const ids = JSON.parse(readFileSync(STATE_FILE, "utf8"))
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []
  } catch {
    return []
  }
}

function writeEnsuredIds(ids) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(ids.slice(-20)))
  } catch {
    // Best effort - worst case the next refresh re-POSTs and the API dedupes.
  }
}

function configError() {
  if (!BASE_URL) return "TICKWARD_BASE_URL is not set"
  if (!API_KEY) return "TICKWARD_API_KEY is not set"
  if (!PROJECT_ID) return "TICKWARD_PROJECT_ID is not set"
  return null
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

function utilizationPercent(window) {
  if (!window || typeof window !== "object") return null
  // Statusline schema: rate_limits.<window>.used_percentage is 0-100.
  const value = window.used_percentage
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function futureResetsAt(window) {
  const value = window && typeof window === "object" ? window.resets_at : null
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value * 1000 > Date.now() ? value : null
}

function formatResetTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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

// Statusline mode: create timers for windows at/above the threshold, then
// always print one status line. Never throws, never sets a non-zero exit.
async function runStatusline(input) {
  const parts = []
  const modelName = input?.model?.display_name
  if (typeof modelName === "string" && modelName) parts.push(modelName)

  const rateLimits = input?.rate_limits ?? {}
  const missingConfig = configError()
  const ensuredIds = readEnsuredIds()
  const targets = []

  for (const window of WINDOWS) {
    const data = rateLimits[window.key]
    const resetsAt = futureResetsAt(data)
    const percent = utilizationPercent(data)
    if (resetsAt === null || percent === null || percent < USAGE_THRESHOLD) continue

    parts.push(`${window.shortName} resets ${formatResetTime(resetsAt)}`)
    const id = timerId(window.idPrefix, resetsAt)
    if (missingConfig) {
      process.stderr.write(`[tickward] ${missingConfig}\n`)
    } else if (!ensuredIds.includes(id)) {
      targets.push({ id, label: window.label, resetsAt })
    }
  }

  const created = []
  await Promise.all(
    targets.map(async (target) => {
      try {
        if (await createTimer(target)) created.push(target.id)
      } catch (error) {
        process.stderr.write(`[tickward] ${error?.message ?? error}\n`)
      }
    }),
  )
  // Never persist ids in dry-run: a later real run must still create them.
  if (!DRY_RUN && created.length > 0) writeEnsuredIds([...ensuredIds, ...created])

  process.stdout.write(`${parts.join(" | ")}\n`)
}

// Hook mode (StopFailure): the turn already died on a rate limit, so create
// timers for every window that reports a future reset, regardless of threshold.
async function runHook(input) {
  const rateLimits = input?.rate_limits ?? {}
  const targets = WINDOWS.map((window) => ({
    window,
    resetsAt: futureResetsAt(rateLimits[window.key]),
  })).filter((target) => target.resetsAt !== null)
  if (targets.length === 0) return // no reset data in this payload - nothing to do

  const missingConfig = configError()
  if (missingConfig) {
    process.stderr.write(`[tickward] ${missingConfig}\n`)
    process.exitCode = 1
    return
  }

  for (const { window, resetsAt } of targets) {
    try {
      const ok = await createTimer({ id: timerId(window.idPrefix, resetsAt), label: window.label, resetsAt })
      if (!ok) process.exitCode = 1
    } catch (error) {
      process.stderr.write(`[tickward] ${error?.message ?? error}\n`)
      process.exitCode = 1
    }
  }
}

async function main() {
  let input = {}
  try {
    input = JSON.parse(await readStdin())
  } catch {
    // Fall through with an empty document; statusline mode still prints.
  }
  if (input && typeof input === "object" && "hook_event_name" in input) {
    await runHook(input)
  } else {
    await runStatusline(input)
  }
}

main().catch((error) => {
  // Statusline commands must never crash; log and exit 0.
  process.stderr.write(`[tickward] ${error?.message ?? error}\n`)
})

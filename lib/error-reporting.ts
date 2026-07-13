// Client-safe error reporting.
//
// Pluggable by design: register ANY sink (Sentry, LogRocket, a custom collector,
// …) via `registerClientErrorReporter`. Independent of that, a best-effort
// default sink POSTs structured reports to the internal endpoint so they land in
// the server logs even when no external monitor is configured.
//
// This module is pure and client-safe (no "server-only"); it is imported by the
// error boundaries and the client instrumentation hook.

export type ClientErrorKind = "react" | "window" | "unhandledrejection"

export type ClientErrorReport = {
  kind: ClientErrorKind
  message: string
  stack?: string
  digest?: string
  source?: string
  url: string
  userAgent: string
  appVersion?: string
  at: string
}

export type ClientErrorReporter = (report: ClientErrorReport) => void

export const CLIENT_ERROR_ENDPOINT = "/api/internal/client-error"

let customReporter: ClientErrorReporter | null = null

/**
 * Plug in a reporter (e.g. `(report) => Sentry.captureException(...)`). Pass
 * `null` to remove it. Self-hosted / private builds can wire any monitor here.
 */
export function registerClientErrorReporter(reporter: ClientErrorReporter | null) {
  customReporter = reporter
}

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
]

function readField(error: unknown, key: "name" | "message" | "stack"): string | undefined {
  if (error && typeof error === "object" && key in error) {
    const value = (error as Record<string, unknown>)[key]
    if (typeof value === "string") return value
    // Other primitives still have a meaningful string form; objects would
    // stringify as "[object Object]", so they are treated as absent.
    if (typeof value === "number" || typeof value === "boolean") return String(value)
  }
  return undefined
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  const message = readField(error, "message")
  if (message !== undefined) return message
  if (typeof error === "number" || typeof error === "boolean") return String(error)
  // Objects without a usable message (and null/undefined) yield "" so callers
  // fall back to their own placeholder instead of "[object Object]".
  return ""
}

function errorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack
  return readField(error, "stack")
}

/** Chunk/version-skew failures: a stale client tries to load a chunk that the
 * latest deploy renamed, so the lazy import 404s. Very common post-deploy. */
export function isChunkLoadError(error: unknown): boolean {
  const name = readField(error, "name") ?? ""
  if (name === "ChunkLoadError") return true
  const haystack = `${name} ${errorMessage(error)}`
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(haystack))
}

const CHUNK_RELOAD_KEY = "tickward:chunk-reloaded"

/** True (and arms the guard) when a chunk error should trigger a one-time
 * reload. Returns false on the second occurrence so we never loop. */
export function shouldRecoverFromChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false
  try {
    if (globalThis.sessionStorage?.getItem(CHUNK_RELOAD_KEY)) return false
    globalThis.sessionStorage?.setItem(CHUNK_RELOAD_KEY, "1")
  } catch {
    // Storage unavailable: still allow a single reload attempt.
  }
  return true
}

export function reloadPage() {
  globalThis.location?.reload()
}

export function toClientErrorReport(args: {
  kind: ClientErrorKind
  error: unknown
  digest?: string
  source?: string
}): ClientErrorReport {
  const nav = typeof navigator === "undefined" ? undefined : navigator
  const loc = typeof location === "undefined" ? undefined : location
  return {
    kind: args.kind,
    message: (errorMessage(args.error) || "Unknown error").slice(0, 2000),
    stack: errorStack(args.error)?.slice(0, 8000),
    digest: args.digest,
    source: args.source,
    url: loc?.href ?? "",
    userAgent: nav?.userAgent ?? "",
    appVersion: process.env.NEXT_PUBLIC_TICKWARD_APP_VERSION,
    at: new Date().toISOString(),
  }
}

// Throttle + dedupe so a crash loop can't flood the sink.
const MAX_REPORTS = 10
const seenSignatures = new Set<string>()
let sentCount = 0

function shouldSend(report: ClientErrorReport): boolean {
  if (sentCount >= MAX_REPORTS) return false
  const signature = `${report.kind}:${report.message}:${report.digest ?? ""}`
  if (seenSignatures.has(signature)) return false
  seenSignatures.add(signature)
  sentCount += 1
  return true
}

/** Test-only: reset the in-memory throttle/dedupe + custom reporter. */
export function __resetClientErrorReporting() {
  seenSignatures.clear()
  sentCount = 0
  customReporter = null
}

function postToEndpoint(report: ClientErrorReport) {
  if (typeof window === "undefined") return
  try {
    const body = JSON.stringify(report)
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(CLIENT_ERROR_ENDPOINT, new Blob([body], { type: "application/json" }))
      return
    }
    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // best effort only
  }
}

/** Fan a report out to: the console (always, for remote inspectors), the
 * registered error monitor, and the default internal endpoint. The external
 * monitor (Sentry or any adapter) is wired as the registered reporter in
 * `instrumentation-client.ts`; see `lib/error-monitor.ts`. */
export function reportClientError(report: ClientErrorReport) {
  if (!shouldSend(report)) return

  console.error(`[tickward] client error (${report.kind})`, report)

  try {
    customReporter?.(report)
  } catch {
    // A broken custom reporter must never mask the original error.
  }

  postToEndpoint(report)
}

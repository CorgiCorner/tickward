// Provider-agnostic error monitoring port.
//
// Implement this interface to forward captured errors to ANY monitor (Sentry,
// GlitchTip, Highlight, a custom collector, ...). Wire the chosen implementation
// in a composition root — `lib/error-monitor-config.ts` for the browser,
// `serverExtensions.errorMonitor` for the server — so core code never depends on
// a concrete provider. An adapter may implement one side or both.
//
// This module is pure and client-safe (no "server-only"); it carries types only.

import type { ClientErrorReport } from "@/lib/error-reporting"

// Shape handed to a server monitor. Mirrors what Next.js `onRequestError`
// exposes (request + render context) plus the normalized error fields.
export type ServerErrorReport = {
  message: string
  name?: string
  stack?: string
  digest?: string
  url?: string
  method?: string
  routePath?: string
  routeType?: string
  renderSource?: string
  environment?: string
  at: string
}

export type ErrorMonitor = {
  captureClientError?(report: ClientErrorReport): void
  captureServerError?(report: ServerErrorReport): void | Promise<void>
}

/**
 * Neutral default for deployments without an external error service. It captures
 * nothing; core code still logs to the console and POSTs to the internal
 * client-error endpoint, so errors stay visible in server logs.
 */
export const noopErrorMonitor: ErrorMonitor = {}

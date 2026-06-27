// Client instrumentation (runs early in the browser, before app code). Captures
// errors that never reach a React error boundary — uncaught exceptions and
// unhandled promise rejections — and routes them through the reporter.

import { clientErrorMonitor } from "@/lib/error-monitor-config"
import { registerClientErrorReporter, reportClientError, toClientErrorReport } from "@/lib/error-reporting"

if (typeof window !== "undefined") {
  // Wire the deployment's chosen error monitor (see lib/error-monitor-config.ts).
  // reportClientError already logs and POSTs to the internal endpoint; the
  // monitor is an additional sink, so leaving it unconfigured degrades cleanly.
  registerClientErrorReporter((report) => clientErrorMonitor.captureClientError?.(report))

  window.addEventListener("error", (event) => {
    reportClientError(
      toClientErrorReport({
        kind: "window",
        error: event.error ?? event.message,
        source: event.filename || undefined,
      }),
    )
  })

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(toClientErrorReport({ kind: "unhandledrejection", error: event.reason }))
  })
}

// Server instrumentation. Next.js calls `onRequestError` for every server-side
// error (SSR render, route handlers, server actions) — the class of error that
// the client-only reporter can never see at its source. We normalize it and hand
// it to whichever error monitor the deployment wired into `serverExtensions`.

import type { ServerErrorReport } from "@/lib/error-monitor"

export function register() {
  // No global setup required; adapters are dependency-free and lazy.
}

type RequestErrorContext = {
  routePath?: string
  routeType?: string
  renderSource?: string
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: RequestErrorContext,
) {
  // The error monitor and its server-extensions graph are Node-only (Prisma,
  // node:crypto, ...). Guarding on NEXT_RUNTIME keeps that import out of the Edge
  // Instrumentation bundle, which cannot load node: modules.
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  try {
    const { serverExtensions } = await import("@/lib/server-extensions.server")
    const monitor = serverExtensions.errorMonitor
    if (!monitor?.captureServerError) return

    const err = error as { message?: string; name?: string; stack?: string; digest?: string }
    const report: ServerErrorReport = {
      message: err?.message ?? String(error),
      name: err?.name,
      stack: err?.stack,
      digest: err?.digest,
      url: request?.path,
      method: request?.method,
      routePath: context?.routePath,
      routeType: context?.routeType,
      renderSource: context?.renderSource,
      environment: process.env.TICKWARD_ENVIRONMENT ?? process.env.NODE_ENV,
      at: new Date().toISOString(),
    }
    await monitor.captureServerError(report)
  } catch {
    // Reporting must never break request handling.
  }
}

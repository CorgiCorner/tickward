// Client composition root for error monitoring (public default).
//
// Ships a neutral no-op monitor: core code still logs to the console and POSTs
// to the internal client-error endpoint. To forward errors to an external
// service, swap the export for any module implementing `ErrorMonitor` — for
// example a Sentry/GlitchTip loader keyed off NEXT_PUBLIC_SENTRY_DSN.

import { noopErrorMonitor, type ErrorMonitor } from "@/lib/error-monitor"

export const clientErrorMonitor: ErrorMonitor = noopErrorMonitor

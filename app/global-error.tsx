"use client"

import { useEffect, useSyncExternalStore } from "react"

import { reloadPage, reportClientError, shouldRecoverFromChunkError, toClientErrorReport } from "@/lib/error-reporting"
import { DEFAULT_LOCALE, formatMessage } from "@/lib/i18n/messages"

// Root error boundary: catches failures in the root layout itself, where the app
// document and styles are gone, so it ships its own <html> with self-contained
// theming. Light by default; `prefers-color-scheme` covers system theme (the app
// default) and a stored manual choice is honored after mount. Recovers from chunk
// errors and reports anything else.

const THEME_STYLE = `
  .te-root { color-scheme: light dark; --bg:#fafafa; --fg:#18181b; --muted:#71717a; --border:#e4e4e7; --btn-bg:#18181b; --btn-fg:#fafafa; }
  @media (prefers-color-scheme: dark) {
    .te-root:not(.te-light) { --bg:#09090b; --fg:#fafafa; --muted:#a1a1aa; --border:#27272a; --btn-bg:#fafafa; --btn-fg:#18181b; }
  }
  .te-root.te-dark { --bg:#09090b; --fg:#fafafa; --muted:#a1a1aa; --border:#27272a; --btn-bg:#fafafa; --btn-fg:#18181b; }
`

// "" lets the media query decide (system theme, the app default); a stored manual
// choice forces the matching class so the error page tracks the app's real theme.
function readThemeClass() {
  try {
    const stored = globalThis.localStorage?.getItem("theme")
    if (stored === "dark") return "te-dark"
    if (stored === "light") return "te-light"
  } catch {
    // no storage access: fall back to the media query
  }
  return ""
}

const subscribeNoop = () => () => {}

export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const themeClass = useSyncExternalStore(subscribeNoop, readThemeClass, () => "")

  useEffect(() => {
    if (shouldRecoverFromChunkError(error)) {
      reloadPage()
      return
    }
    reportClientError(toClientErrorReport({ kind: "react", error, digest: error.digest }))
  }, [error])

  const buttonStyle: React.CSSProperties = {
    borderRadius: "0.5rem",
    border: "1px solid var(--border)",
    background: "var(--btn-bg)",
    color: "var(--btn-fg)",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    cursor: "pointer",
  }

  return (
    <html lang="en" className={`te-root ${themeClass}`.trim()}>
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "var(--bg)",
          color: "var(--fg)",
        }}
      >
        <style>{THEME_STYLE}</style>
        <main
          style={{
            minHeight: "100svh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
            {formatMessage("error.title", {}, DEFAULT_LOCALE)}
          </h1>
          <p style={{ margin: 0, maxWidth: "24rem", fontSize: "0.875rem", color: "var(--muted)" }}>
            {formatMessage("error.description", {}, DEFAULT_LOCALE)}
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" style={buttonStyle} onClick={() => reset()}>
              {formatMessage("error.reload", {}, DEFAULT_LOCALE)}
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, background: "transparent", color: "var(--fg)" }}
              onClick={() => globalThis.history.back()}
            >
              {formatMessage("error.back", {}, DEFAULT_LOCALE)}
            </button>
          </div>
          {error.digest ? (
            <p
              style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: "0.6875rem", color: "var(--muted)" }}
            >
              {formatMessage("error.reference", { id: error.digest }, DEFAULT_LOCALE)}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}

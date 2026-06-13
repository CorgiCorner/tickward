const DOCS_ROUTE_PATHS = [
  "/docs",
  "/docs/guides/self-hosting",
  "/docs/guides/api-quickstart",
  "/docs/guides/embedding-timers",
  "/docs/guides/webhooks",
  "/docs/guides/mcp",
  "/docs/guides/agent-usage",
  "/docs/api-reference",
] as const

function docsOrigin() {
  const value = process.env.TICKWARD_DOCS_ORIGIN?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.toString().replace(/\/$/, "")
  } catch {
    return null
  }
}

export function isDocsRedirectConfigured() {
  return Boolean(docsOrigin())
}

// Docs are locale-neutral: served at the bare /docs path (external docs origin
// or the catch-all docs route), like /api and /embed. They are NOT under the
// /<locale> app tree, so they keep the bare path and are exempt from the
// locale redirect in proxy.ts.
export function getDocsHref() {
  return docsOrigin() ?? "/docs"
}

export function getDocsPageHref(path: string) {
  const base = getDocsHref()
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  return `${base}${cleanPath}`
}

export function getDocsSitemapPaths() {
  return isDocsRedirectConfigured() ? [...DOCS_ROUTE_PATHS] : []
}

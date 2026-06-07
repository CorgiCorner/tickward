const DOCS_ROUTE_PATHS = [
  "/docs",
  "/docs/guides/self-hosting",
  "/docs/guides/api-quickstart",
  "/docs/guides/agent-usage",
  "/docs/api-reference",
] as const

export function isDocsRedirectConfigured() {
  return Boolean(process.env.TICKWARD_DOCS_ORIGIN?.trim())
}

export function getDocsHref() {
  return "/docs"
}

export function getDocsSitemapPaths() {
  return isDocsRedirectConfigured() ? DOCS_ROUTE_PATHS : []
}

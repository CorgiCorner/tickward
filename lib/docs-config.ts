import docsJson from "@/docs/site/docs.json"

function collectDocsPageRefs(config: unknown) {
  const refs: string[] = []

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    if (!value || typeof value !== "object") return
    const record = value as Record<string, unknown>
    if (Array.isArray(record.pages)) {
      for (const page of record.pages) {
        if (typeof page === "string") refs.push(page)
      }
    }
    for (const child of Object.values(record)) visit(child)
  }

  visit(config)
  return [...new Set(refs)]
}

const DOCS_ROUTE_PATHS = collectDocsPageRefs(docsJson.navigation).map((page) =>
  page === "index" ? "/docs" : `/docs/${page}`,
)

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

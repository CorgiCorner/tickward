import { getDocsPageHref } from "@/lib/docs-config"
import { getSiteOrigin } from "@/lib/site-config"

export const runtime = "nodejs"

// API Catalog for automated API discovery (RFC 9727). Advertises the versioned
// REST API with links to its machine-readable OpenAPI description and human docs.
export function GET() {
  const siteOrigin = getSiteOrigin()
  const docsHref = getDocsPageHref("/api-reference")
  const serviceDoc = docsHref.startsWith("http") ? docsHref : `${siteOrigin}${docsHref}`

  const catalog = {
    linkset: [
      {
        anchor: `${siteOrigin}/api/v1`,
        "service-desc": [{ href: `${siteOrigin}/openapi.json`, type: "application/json" }],
        "service-doc": [{ href: serviceDoc, type: "text/html" }],
      },
    ],
  }

  return new Response(JSON.stringify(catalog), {
    headers: {
      "Content-Type": "application/linkset+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}

import openapiSpec from "@/openapi.json"

export const runtime = "nodejs"

// Serve the versioned OpenAPI description so agents (and the API Catalog
// service-desc link) can discover the machine-readable contract at a stable URL.
export function GET() {
  return new Response(JSON.stringify(openapiSpec), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}

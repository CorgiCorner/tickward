import { proxyMcpDiscovery } from "@/lib/mcp-discovery-proxy.server"
import { getSiteOrigin } from "@/lib/site-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Mirror the MCP server's OAuth protected resource metadata (RFC 9728) on the
// apex so agents discovering the site root can find how to obtain a token.
// RFC 9728 ties the metadata document to the host that serves it, so the
// `resource` identifier is rewritten to the apex origin while the
// authorization servers keep pointing at the MCP OAuth issuer.
export function GET() {
  return proxyMcpDiscovery("/.well-known/oauth-protected-resource", {
    transformJson: (document) => ({ ...document, resource: getSiteOrigin() }),
  })
}

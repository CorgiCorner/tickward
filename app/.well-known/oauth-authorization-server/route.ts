import { proxyMcpDiscovery } from "@/lib/mcp-discovery-proxy.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Mirror the MCP server's OAuth authorization server metadata (RFC 8414) on the
// apex so agents discovering the site root can find how to authenticate.
export function GET() {
  return proxyMcpDiscovery("/.well-known/oauth-authorization-server")
}

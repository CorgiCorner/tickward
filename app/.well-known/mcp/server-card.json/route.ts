import { proxyMcpDiscovery } from "@/lib/mcp-discovery-proxy.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Mirror the MCP Server Card (SEP-1649) on the apex so agents discovering the
// site root can find the MCP server's transport endpoint and capabilities.
export function GET() {
  return proxyMcpDiscovery("/.well-known/mcp/server-card.json")
}

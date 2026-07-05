import { apiJson, apiList, isResponse } from "@/lib/api-response"
import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  requireSignedInUser,
} from "@/lib/account-api-route.server"
import { listMcpConnectionsForUser } from "@/lib/mcp-oauth.server"

export const runtime = "nodejs"

function mcpConnectionStorageUnavailable(operation: string, error: unknown) {
  return accountRouteStorageUnavailable({
    error,
    logName: "mcpConnections",
    message: "MCP connection storage is unavailable.",
    operation,
  })
}

export async function GET(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to manage MCP connections.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({
    bucket: "mcp-connection-management",
    key: `user:${actor.user.id}`,
  })
  if (rateLimit) return rateLimit

  try {
    const connections = await listMcpConnectionsForUser(actor.user)
    return apiJson(apiList(connections), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return mcpConnectionStorageUnavailable("list", error)
  }
}

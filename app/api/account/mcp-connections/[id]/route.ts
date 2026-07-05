import { apiError, apiJson, isResponse } from "@/lib/api-response"
import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  requireSignedInUser,
} from "@/lib/account-api-route.server"
import { revokeMcpConnectionForUser } from "@/lib/mcp-oauth.server"

export const runtime = "nodejs"

type McpConnectionRouteContext = {
  params: Promise<{ id: string }>
}

function mcpConnectionStorageUnavailable(operation: string, error: unknown) {
  return accountRouteStorageUnavailable({
    error,
    logName: "mcpConnections",
    message: "MCP connection storage is unavailable.",
    operation,
  })
}

export async function DELETE(req: Request, context: McpConnectionRouteContext) {
  const actor = await requireSignedInUser(req, "Sign in to manage MCP connections.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({
    bucket: "mcp-connection-management",
    key: `user:${actor.user.id}`,
  })
  if (rateLimit) return rateLimit

  const { id } = await context.params
  try {
    const revoked = await revokeMcpConnectionForUser({ id, user: actor.user })
    if (!revoked) return apiError("not_found", "MCP connection not found.", { status: 404 })
    return apiJson({ deleted: true, id, object: "mcp_connection" })
  } catch (error) {
    return mcpConnectionStorageUnavailable("revoke", error)
  }
}

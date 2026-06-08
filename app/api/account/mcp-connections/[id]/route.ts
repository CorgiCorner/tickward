import { getCurrentActor } from "@/lib/actor.server"
import { apiError, apiJson, isResponse } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"
import { revokeMcpConnectionForUser } from "@/lib/mcp-oauth.server"
import { checkRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

type McpConnectionRouteContext = {
  params: Promise<{ id: string }>
}

async function signedInUser(req: Request): Promise<UserActor | Response> {
  try {
    const actor = await getCurrentActor({ request: req })
    if (actor.kind === "user") return actor
  } catch {}
  return apiError("unauthorized", "Sign in to manage MCP connections.", { status: 401 })
}

async function enforceManagementRateLimit(userId: string) {
  try {
    const rateLimit = await checkRateLimit("mcp-connection-management", `user:${userId}`)
    if (rateLimit.allowed) return null
    return apiError("rate_limited", "Too many requests.", { headers: rateLimit.headers, status: 429 })
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }
}

function mcpConnectionStorageUnavailable(operation: string, error: unknown) {
  console.error(`[tickward] mcpConnections.${operation}`, error)
  return apiError("storage_unavailable", "MCP connection storage is unavailable.", { status: 503 })
}

export async function DELETE(req: Request, context: McpConnectionRouteContext) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
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

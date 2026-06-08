import { getCurrentActor } from "@/lib/actor.server"
import { apiError, apiJson, apiList, isResponse } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"
import { listMcpConnectionsForUser } from "@/lib/mcp-oauth.server"
import { checkRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

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

export async function GET(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  try {
    const connections = await listMcpConnectionsForUser(actor.user)
    return apiJson(apiList(connections), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return mcpConnectionStorageUnavailable("list", error)
  }
}

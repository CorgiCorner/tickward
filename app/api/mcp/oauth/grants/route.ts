import { NextResponse } from "next/server"

import { getCurrentActor } from "@/lib/actor.server"
import { apiError, isResponse } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"
import { normalizeMcpHandoffId, readMcpAuthorizationHandoff } from "@/lib/mcp-authorization-handoff.server"
import { createMcpAuthorizationGrantForUser } from "@/lib/mcp-oauth.server"
import { checkRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

async function signedInUser(req: Request): Promise<UserActor | Response> {
  try {
    const actor = await getCurrentActor({ request: req })
    if (actor.kind === "user") return actor
  } catch {}
  return apiError("unauthorized", "Sign in to connect MCP.", { status: 401 })
}

async function enforceGrantRateLimit(userId: string) {
  try {
    const rateLimit = await checkRateLimit("mcp-oauth-grant", `user:${userId}`)
    if (rateLimit.allowed) return null
    return apiError("rate_limited", "Too many requests.", { headers: rateLimit.headers, status: 429 })
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }
}

export async function POST(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceGrantRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  const form = await req.formData().catch(() => null)
  const handoff = normalizeMcpHandoffId(form?.get("handoff"))
  const mcpOrigin = String(form?.get("mcp_origin") ?? "")
  if (!handoff) return apiError("validation_error", "MCP authorization handoff is invalid.", { status: 400 })

  const authorization = await readMcpAuthorizationHandoff({ handoff, mcpOrigin }).catch(() => null)
  if (!authorization) {
    return apiError("validation_error", "MCP authorization request is unavailable.", { status: 400 })
  }

  const grant = await createMcpAuthorizationGrantForUser({
    clientName: authorization.clientName,
    mcpOrigin: authorization.mcpOrigin,
    scopes: authorization.scopes,
    user: actor.user,
  })

  const redirectUrl = new URL("/authorize/callback", authorization.mcpOrigin)
  redirectUrl.searchParams.set("handoff", authorization.handoff)
  redirectUrl.searchParams.set("grant", grant.grantToken)
  return NextResponse.redirect(redirectUrl, { status: 303 })
}

import { NextResponse } from "next/server"

import { apiError, isResponse } from "@/lib/api-response"
import { enforceAccountRateLimit, requireSignedInUser } from "@/lib/account-api-route.server"
import { normalizeMcpHandoffId, readMcpAuthorizationHandoff } from "@/lib/mcp-authorization-handoff.server"
import { createMcpAuthorizationGrantForUser } from "@/lib/mcp-oauth.server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to connect MCP.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "mcp-oauth-grant", key: `user:${actor.user.id}` })
  if (rateLimit) return rateLimit

  const form = await req.formData().catch(() => null)
  const handoff = normalizeMcpHandoffId(form?.get("handoff"))
  const rawMcpOrigin = form?.get("mcp_origin")
  const mcpOrigin = typeof rawMcpOrigin === "string" ? rawMcpOrigin : ""
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

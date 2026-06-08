import { createHash } from "node:crypto"

import { apiError, apiJson } from "@/lib/api-response"
import { exchangeMcpAuthorizationGrant } from "@/lib/mcp-oauth.server"
import { checkRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

async function readJson(req: Request) {
  try {
    return await req.json()
  } catch {
    return null
  }
}

async function enforceExchangeRateLimit(key: string) {
  try {
    const rateLimit = await checkRateLimit("mcp-oauth-exchange", key)
    if (rateLimit.allowed) return null
    return apiError("rate_limited", "Too many requests.", { headers: rateLimit.headers, status: 429 })
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }
}

export async function POST(req: Request) {
  const body = await readJson(req)
  const grant = body && typeof body === "object" ? String((body as { grant?: unknown }).grant ?? "").trim() : ""
  if (!grant) return apiError("validation_error", "grant is required.", { status: 400 })

  const grantHash = createHash("sha256").update(`tickward:mcp-oauth-exchange:${grant}`, "utf8").digest("hex")
  const rateLimit = await enforceExchangeRateLimit(`grant:${grantHash.slice(0, 32)}`)
  if (rateLimit) return rateLimit

  const exchange = await exchangeMcpAuthorizationGrant(grant)
  if (!exchange) {
    return apiError("unauthorized", "MCP authorization grant is invalid or expired.", { status: 401 })
  }

  return apiJson(
    {
      connection: exchange.connection,
      object: "mcp_oauth_exchange",
      token: exchange.token,
      user: {
        email: exchange.user.email,
        id: exchange.user.id,
        role: exchange.user.role,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}

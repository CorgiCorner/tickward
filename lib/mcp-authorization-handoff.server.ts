import "server-only"

import { z } from "zod"

import { getMcpRemoteUrl } from "@/lib/mcp-config.server"
import { normalizeMcpOAuthScopes } from "@/lib/mcp-oauth"

export type McpAuthorizationHandoff = {
  clientName: string
  expiresAt: string
  handoff: string
  mcpOrigin: string
  scopes: ReturnType<typeof normalizeMcpOAuthScopes>
}

const handoffIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
const handoffResponseSchema = z.object({
  client_name: z.string().nullable().optional(),
  expires_at: z.string(),
  handoff: z.string(),
  object: z.literal("mcp_authorization_handoff"),
  scopes: z.array(z.string()),
})

export function normalizeMcpHandoffId(value: unknown) {
  const parsed = handoffIdSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function allowedMcpAuthorizationOrigin(value: unknown) {
  if (typeof value !== "string") return null

  let origin: string
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && !isLocalhost(url)) return null
    origin = url.origin
  } catch {
    return null
  }

  const configured = getMcpRemoteUrl()
  if (configured) {
    try {
      return new URL(configured).origin === origin ? origin : null
    } catch {
      return null
    }
  }

  if (process.env.NODE_ENV !== "production" && isLocalhost(new URL(origin))) return origin
  return null
}

export async function readMcpAuthorizationHandoff(args: {
  handoff: string
  mcpOrigin: string
}): Promise<McpAuthorizationHandoff | null> {
  const handoff = normalizeMcpHandoffId(args.handoff)
  const mcpOrigin = allowedMcpAuthorizationOrigin(args.mcpOrigin)
  if (!handoff || !mcpOrigin) return null

  const res = await fetch(`${mcpOrigin}/oauth/handoff/${encodeURIComponent(handoff)}`, { cache: "no-store" })
  if (!res.ok) return null

  const data = handoffResponseSchema.safeParse(await res.json().catch(() => null))
  if (!data.success || data.data.handoff !== handoff) return null

  const scopes = normalizeMcpOAuthScopes(data.data.scopes)
  if (scopes.length === 0) return null

  return {
    clientName: data.data.client_name ?? "MCP client",
    expiresAt: data.data.expires_at,
    handoff,
    mcpOrigin,
    scopes,
  }
}

function isLocalhost(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1"
}

import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { recordAuditEvent } from "@/lib/audit-log.server"
import type { UserRef } from "@/lib/contracts"
import { hashApiKeyToken, MCP_CREDENTIAL_KIND, publicApiCredentialRecord } from "@/lib/api-keys.server"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"
import {
  MCP_CONNECTION_TOKEN_PREFIX,
  type McpConnectionPublicRecord,
  type McpOAuthScope,
  mcpConnectionPermission,
  normalizeMcpOAuthScopes,
} from "@/lib/mcp-oauth"

const MCP_GRANT_PREFIX = "mcpg_"
const MCP_GRANT_TTL_MS = 10 * 60 * 1000
const MCP_CONNECTION_NAME_PREFIX = "MCP: "

export type McpConnectionRecord = McpConnectionPublicRecord

export type McpAuthorizationGrantRecord = {
  grantToken: string
  expiresAt: Date
}

export type McpAuthorizationGrantExchange = {
  connection: McpConnectionRecord
  token: string
  user: UserRef
}

type McpAuthorizationGrantRow = {
  id: string
  userId: string
  tokenHash: string
  clientName: string | null
  scopes: unknown
  mcpOrigin: string
  createdAt: Date
  expiresAt: Date
  usedAt: Date | null
  user: {
    id: string
    email: string
    role: string | null
  }
}

function createToken(prefix: string) {
  return `${prefix}${randomBytes(32).toString("base64url")}`
}

function hashGrantToken(token: string) {
  return createHash("sha256").update(`tickward:mcp-oauth-grant:${token}`, "utf8").digest("hex")
}

function tokenPrefix(token: string) {
  return token.slice(0, MCP_CONNECTION_TOKEN_PREFIX.length + 6)
}

function tokenLast4(token: string) {
  return token.slice(-4)
}

function nowPlus(ms: number) {
  return new Date(Date.now() + ms)
}

function userRefFromRow(row: McpAuthorizationGrantRow["user"]): UserRef {
  return {
    email: row.email,
    id: row.id,
    role: row.role === "admin" ? "admin" : "user",
  }
}

function mcpConnectionRecord(row: {
  clientName: string | null
  createdAt: Date
  id: string
  keyLast4: string
  keyPrefix: string
  lastUsedAt: Date | null
  name: string
  permission: string
  revokedAt: Date | null
  scopes: unknown
  updatedAt: Date
}): McpConnectionRecord {
  const credential = publicApiCredentialRecord(row)
  return {
    ...credential,
    object: "mcp_connection",
    client_name: row.clientName,
    scopes: normalizeMcpOAuthScopes(row.scopes),
  }
}

export function normalizeMcpClientName(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 120)
}

export function normalizeMcpOrigin(value: unknown) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    url.pathname = ""
    url.search = ""
    url.hash = ""
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null
    return url.origin
  } catch {
    return null
  }
}

export async function listMcpConnectionsForUser(user: UserRef): Promise<McpConnectionRecord[]> {
  const prisma = requirePrismaClient()
  const rows = await prisma.apiKey.findMany({
    where: { kind: MCP_CREDENTIAL_KIND, userId: user.id },
    orderBy: { createdAt: "desc" },
  })
  return rows.map(mcpConnectionRecord)
}

export async function revokeMcpConnectionForUser(args: {
  id: string
  user: UserRef
}): Promise<McpConnectionRecord | null> {
  const prisma = requirePrismaClient()
  const updated = await prisma.apiKey.updateManyAndReturn({
    where: { id: args.id, kind: MCP_CREDENTIAL_KIND, revokedAt: null, userId: args.user.id },
    data: { revokedAt: new Date() },
  })

  if (updated[0]) {
    recordAuditEvent({
      action: "mcp.connection.revoked",
      actorEmail: args.user.email,
      actorId: args.user.id,
      metadata: {
        client_name: updated[0].clientName,
        key_prefix: updated[0].keyPrefix,
        scopes: normalizeMcpOAuthScopes(updated[0].scopes),
      },
      targetId: updated[0].id,
      targetType: "mcp_connection",
    })
  }

  return updated[0] ? mcpConnectionRecord(updated[0]) : null
}

export async function createMcpAuthorizationGrantForUser(args: {
  clientName?: string | null
  mcpOrigin: string
  scopes: McpOAuthScope[]
  user: UserRef
}): Promise<McpAuthorizationGrantRecord> {
  const prisma = requirePrismaClient()
  const grantToken = createToken(MCP_GRANT_PREFIX)
  const expiresAt = nowPlus(MCP_GRANT_TTL_MS)

  await prisma.mcpAuthorizationGrant.create({
    data: {
      clientName: normalizeMcpClientName(args.clientName),
      expiresAt,
      mcpOrigin: args.mcpOrigin,
      scopes: args.scopes as Prisma.InputJsonValue,
      tokenHash: hashGrantToken(grantToken),
      userId: args.user.id,
    },
  })

  return { expiresAt, grantToken }
}

export async function exchangeMcpAuthorizationGrant(grantToken: string): Promise<McpAuthorizationGrantExchange | null> {
  if (!grantToken.startsWith(MCP_GRANT_PREFIX)) return null

  const prisma = requirePrismaClient()
  const grantHash = hashGrantToken(grantToken)
  const now = new Date()
  const mcpToken = createToken(MCP_CONNECTION_TOKEN_PREFIX)

  const result = await prisma.$transaction(async (tx) => {
    const grant = (await tx.mcpAuthorizationGrant.findUnique({
      where: { tokenHash: grantHash },
      include: { user: true },
    })) as McpAuthorizationGrantRow | null

    if (!grant || grant.usedAt || grant.expiresAt.getTime() <= now.getTime()) return null

    const scopes = normalizeMcpOAuthScopes(grant.scopes)
    if (scopes.length === 0) return null

    await tx.mcpAuthorizationGrant.update({
      where: { id: grant.id },
      data: { usedAt: now },
    })

    const clientName = normalizeMcpClientName(grant.clientName)
    const row = await tx.apiKey.create({
      data: {
        clientName,
        keyHash: hashApiKeyToken(mcpToken),
        keyLast4: tokenLast4(mcpToken),
        keyPrefix: tokenPrefix(mcpToken),
        kind: MCP_CREDENTIAL_KIND,
        name: clientName ? `${MCP_CONNECTION_NAME_PREFIX}${clientName}` : "MCP connection",
        permission: mcpConnectionPermission(scopes),
        scopes: scopes as Prisma.InputJsonValue,
        userId: grant.userId,
      },
    })

    return {
      connection: mcpConnectionRecord(row),
      token: mcpToken,
      user: userRefFromRow(grant.user),
    }
  })

  await prisma.mcpAuthorizationGrant
    .deleteMany({ where: { expiresAt: { lt: now }, usedAt: { not: null } } })
    .catch(() => undefined)

  return result
}

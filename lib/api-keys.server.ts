import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { recordAuditEvent } from "@/lib/audit-log.server"
import type { UserRef } from "@/lib/contracts"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"

export const API_KEY_PREFIX = "tw_"
export const MCP_API_KEY_PREFIX = "tw_mcp_"
export const API_KEY_PERMISSIONS = ["full_access", "read"] as const
export const API_KEY_KIND = "api_key"
export const MCP_CREDENTIAL_KIND = "mcp_connection"
export const API_CREDENTIAL_KINDS = [API_KEY_KIND, MCP_CREDENTIAL_KIND] as const
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number]
export type ApiCredentialKind = (typeof API_CREDENTIAL_KINDS)[number]

export type ApiKeyPublicRecord = {
  id: string
  object: "api_key"
  name: string
  permission: ApiKeyPermission
  key_prefix: string
  key_last4: string
  created_at: string
  updated_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type CreatedApiKeyRecord = ApiKeyPublicRecord & {
  token: string
}

export type AuthenticatedApiKey = {
  id: string
  kind: ApiCredentialKind
  permission: ApiKeyPermission
  user: UserRef
  rateLimitKey: string
  scopes: string[]
}

type ApiKeyRow = {
  clientName?: string | null
  id: string
  kind?: string
  name: string
  permission: string
  keyPrefix: string
  keyLast4: string
  scopes?: unknown
  createdAt: Date
  updatedAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

function isApiKeyPermission(value: unknown): value is ApiKeyPermission {
  return API_KEY_PERMISSIONS.includes(value as ApiKeyPermission)
}

function isApiCredentialKind(value: unknown): value is ApiCredentialKind {
  return API_CREDENTIAL_KINDS.includes(value as ApiCredentialKind)
}

export function normalizeApiKeyPermission(value: unknown): ApiKeyPermission | null {
  return isApiKeyPermission(value) ? value : null
}

export function normalizeApiCredentialKind(value: unknown): ApiCredentialKind {
  return isApiCredentialKind(value) ? value : API_KEY_KIND
}

export function normalizeApiKeyName(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 80) return null
  return trimmed
}

export function createApiKeyToken() {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`
}

export function hashApiKeyToken(token: string) {
  // API keys are generated above from 32 random bytes (256 bits), rather than
  // chosen by a user like a password. This digest is a stable database lookup
  // key; changing it would invalidate every issued API and MCP credential.
  // codeql[js/insufficient-password-hash]
  return createHash("sha256").update(`tickward:api-key:${token}`, "utf8").digest("hex")
}

export function publicApiCredentialRecord(row: ApiKeyRow): ApiKeyPublicRecord {
  return {
    id: row.id,
    object: "api_key",
    name: row.name,
    permission: normalizeApiKeyPermission(row.permission) ?? "read",
    key_prefix: row.keyPrefix,
    key_last4: row.keyLast4,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
  }
}

function userUpsertFields(user: UserRef) {
  const email = user.email ?? `${user.id}@users.tickward.local`

  return {
    where: { id: user.id },
    update: {
      email,
      role: user.role ?? "user",
    },
    create: {
      id: user.id,
      name: user.email ?? user.id,
      email,
      emailVerified: Boolean(user.email),
      role: user.role ?? "user",
    },
  }
}

export async function listApiKeysForUser(user: UserRef): Promise<ApiKeyPublicRecord[]> {
  const prisma = requirePrismaClient()
  const rows = await prisma.apiKey.findMany({
    where: { kind: API_KEY_KIND, userId: user.id },
    orderBy: { createdAt: "desc" },
  })
  return rows.map(publicApiCredentialRecord)
}

export async function createApiKeyForUser(args: {
  name: string
  permission: ApiKeyPermission
  user: UserRef
}): Promise<CreatedApiKeyRecord> {
  const prisma = requirePrismaClient()
  const token = createApiKeyToken()
  const keyPrefix = token.slice(0, API_KEY_PREFIX.length + 6)
  const keyLast4 = token.slice(-4)
  const keyHash = hashApiKeyToken(token)

  const row = await prisma.$transaction(async (tx) => {
    await tx.user.upsert(userUpsertFields(args.user))
    return tx.apiKey.create({
      data: {
        keyHash,
        keyLast4,
        keyPrefix,
        kind: API_KEY_KIND,
        name: args.name,
        permission: args.permission,
        userId: args.user.id,
      },
    })
  })

  recordAuditEvent({
    action: "api_key.created",
    actorEmail: args.user.email,
    actorId: args.user.id,
    metadata: { key_prefix: row.keyPrefix, permission: row.permission },
    targetId: row.id,
    targetType: "api_key",
  })

  return { ...publicApiCredentialRecord(row), token }
}

export async function updateApiKeyForUser(args: {
  id: string
  name?: string
  permission?: ApiKeyPermission
  user: UserRef
}): Promise<ApiKeyPublicRecord | null> {
  const prisma = requirePrismaClient()
  const data: Prisma.ApiKeyUpdateInput = {}
  if (args.name !== undefined) data.name = args.name
  if (args.permission !== undefined) data.permission = args.permission

  const updated = await prisma.apiKey.updateManyAndReturn({
    where: { id: args.id, kind: API_KEY_KIND, userId: args.user.id, revokedAt: null },
    data,
  })

  return updated[0] ? publicApiCredentialRecord(updated[0]) : null
}

export async function revokeApiKeyForUser(args: { id: string; user: UserRef }): Promise<ApiKeyPublicRecord | null> {
  const prisma = requirePrismaClient()
  const revokedAt = new Date()
  const updated = await prisma.apiKey.updateManyAndReturn({
    where: { id: args.id, kind: API_KEY_KIND, userId: args.user.id, revokedAt: null },
    data: { revokedAt },
  })

  if (updated[0]) {
    recordAuditEvent({
      action: "api_key.revoked",
      actorEmail: args.user.email,
      actorId: args.user.id,
      metadata: { key_prefix: updated[0].keyPrefix, permission: updated[0].permission },
      targetId: updated[0].id,
      targetType: "api_key",
    })
  }

  return updated[0] ? publicApiCredentialRecord(updated[0]) : null
}

export function readBearerApiKey(req: Request): string | null {
  const header = req.headers.get("authorization")?.trim()
  if (!header) return null

  const [scheme, token] = header.split(/\s+/, 2)
  if (scheme?.toLowerCase() !== "bearer" || !token) return null
  return token
}

function shouldTouchLastUsedAt(lastUsedAt: Date | null) {
  if (!lastUsedAt) return true
  return Date.now() - lastUsedAt.getTime() > 15 * 60 * 1000
}

export async function authenticateApiKey(token: string): Promise<AuthenticatedApiKey | null> {
  if (!token.startsWith(API_KEY_PREFIX) && !token.startsWith(MCP_API_KEY_PREFIX)) return null

  const prisma = requirePrismaClient()
  const keyHash = hashApiKeyToken(token)
  const row = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  })

  const permission = normalizeApiKeyPermission(row?.permission)
  if (!row || row.revokedAt || !permission) return null

  if (shouldTouchLastUsedAt(row.lastUsedAt)) {
    await prisma.apiKey.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    })
  }

  return {
    id: row.id,
    kind: normalizeApiCredentialKind(row.kind),
    permission,
    rateLimitKey: `user:${row.userId}`,
    scopes: Array.isArray(row.scopes) ? row.scopes.filter((scope): scope is string => typeof scope === "string") : [],
    user: {
      id: row.user.id,
      email: row.user.email,
      role: row.user.role === "admin" ? "admin" : "user",
    },
  }
}

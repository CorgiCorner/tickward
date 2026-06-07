import "server-only"

import { createHash, randomBytes } from "node:crypto"

import type { UserRef } from "@/lib/contracts"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"

export const API_KEY_PREFIX = "tw_"
export const API_KEY_PERMISSIONS = ["full_access", "read"] as const
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number]

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
  permission: ApiKeyPermission
  user: UserRef
  rateLimitKey: string
}

type ApiKeyRow = {
  id: string
  name: string
  permission: string
  keyPrefix: string
  keyLast4: string
  createdAt: Date
  updatedAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

function isApiKeyPermission(value: unknown): value is ApiKeyPermission {
  return API_KEY_PERMISSIONS.includes(value as ApiKeyPermission)
}

export function normalizeApiKeyPermission(value: unknown): ApiKeyPermission | null {
  return isApiKeyPermission(value) ? value : null
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
  return createHash("sha256").update(`tickward:api-key:${token}`, "utf8").digest("hex")
}

function publicApiKey(row: ApiKeyRow): ApiKeyPublicRecord {
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
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })
  return rows.map(publicApiKey)
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
        name: args.name,
        permission: args.permission,
        userId: args.user.id,
      },
    })
  })

  return { ...publicApiKey(row), token }
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
    where: { id: args.id, userId: args.user.id, revokedAt: null },
    data,
  })

  return updated[0] ? publicApiKey(updated[0]) : null
}

export async function revokeApiKeyForUser(args: { id: string; user: UserRef }): Promise<ApiKeyPublicRecord | null> {
  const prisma = requirePrismaClient()
  const revokedAt = new Date()
  const updated = await prisma.apiKey.updateManyAndReturn({
    where: { id: args.id, userId: args.user.id, revokedAt: null },
    data: { revokedAt },
  })

  return updated[0] ? publicApiKey(updated[0]) : null
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
  if (!token.startsWith(API_KEY_PREFIX)) return null

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
    permission,
    rateLimitKey: `user:${row.userId}`,
    user: {
      id: row.user.id,
      email: row.user.email,
      role: row.user.role === "admin" ? "admin" : "user",
    },
  }
}

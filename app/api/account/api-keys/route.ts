import { getCurrentActor } from "@/lib/actor.server"
import { apiError, apiJson, apiList, isResponse } from "@/lib/api-response"
import {
  createApiKeyForUser,
  listApiKeysForUser,
  normalizeApiKeyName,
  normalizeApiKeyPermission,
} from "@/lib/api-keys.server"
import type { UserActor } from "@/lib/contracts"
import { checkRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

async function signedInUser(req: Request): Promise<UserActor | Response> {
  try {
    const actor = await getCurrentActor({ request: req })
    if (actor.kind === "user") return actor
  } catch {}
  return apiError("unauthorized", "Sign in to manage API keys.", { status: 401 })
}

async function enforceManagementRateLimit(userId: string) {
  try {
    const rateLimit = await checkRateLimit("api-key-management", `user:${userId}`)
    if (rateLimit.allowed) return null
    return apiError("rate_limited", "Too many requests.", { headers: rateLimit.headers, status: 429 })
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }
}

async function readJson(req: Request) {
  try {
    return await req.json()
  } catch {
    return apiError("validation_error", "Request body must be valid JSON.", { status: 400 })
  }
}

function apiKeyStorageUnavailable(operation: string, error: unknown) {
  console.error(`[tickward] apiKeys.${operation}`, error)
  return apiError("storage_unavailable", "API key storage is unavailable.", { status: 503 })
}

export async function GET(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  try {
    const apiKeys = await listApiKeysForUser(actor.user)
    return apiJson(apiList(apiKeys), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return apiKeyStorageUnavailable("list", error)
  }
}

export async function POST(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  const body = await readJson(req)
  if (isResponse(body)) return body

  const objectBody = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const name = normalizeApiKeyName(objectBody.name)
  const permission = normalizeApiKeyPermission(objectBody.permission ?? "read")

  if (!name) {
    return apiError("validation_error", "name must be between 1 and 80 characters.", { status: 400 })
  }
  if (!permission) {
    return apiError("validation_error", "permission must be full_access or read.", { status: 400 })
  }

  try {
    const created = await createApiKeyForUser({ name, permission, user: actor.user })
    return apiJson(created, { status: 201 })
  } catch (error) {
    return apiKeyStorageUnavailable("create", error)
  }
}

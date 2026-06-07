import { getCurrentActor } from "@/lib/actor.server"
import { apiError, apiJson, isResponse } from "@/lib/api-response"
import {
  normalizeApiKeyName,
  normalizeApiKeyPermission,
  revokeApiKeyForUser,
  updateApiKeyForUser,
} from "@/lib/api-keys.server"
import type { UserActor } from "@/lib/contracts"
import { checkRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

type ApiKeyRouteContext = {
  params: Promise<{ id: string }>
}

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

export async function PATCH(req: Request, context: ApiKeyRouteContext) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  const body = await readJson(req)
  if (isResponse(body)) return body

  const objectBody = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  let name: string | undefined
  if (objectBody.name !== undefined) {
    const parsedName = normalizeApiKeyName(objectBody.name)
    if (!parsedName) {
      return apiError("validation_error", "name must be between 1 and 80 characters.", { status: 400 })
    }
    name = parsedName
  }

  let permission: "full_access" | "read" | undefined
  if (objectBody.permission !== undefined) {
    const parsedPermission = normalizeApiKeyPermission(objectBody.permission)
    if (!parsedPermission) {
      return apiError("validation_error", "permission must be full_access or read.", { status: 400 })
    }
    permission = parsedPermission
  }

  if (name === undefined && permission === undefined) {
    return apiError("validation_error", "Provide name or permission to update.", { status: 400 })
  }

  const { id } = await context.params
  try {
    const updated = await updateApiKeyForUser({ id, name, permission, user: actor.user })
    if (!updated) return apiError("not_found", "API key not found.", { status: 404 })
    return apiJson(updated)
  } catch (error) {
    return apiKeyStorageUnavailable("update", error)
  }
}

export async function DELETE(req: Request, context: ApiKeyRouteContext) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  const { id } = await context.params
  try {
    const revoked = await revokeApiKeyForUser({ id, user: actor.user })
    if (!revoked) return apiError("not_found", "API key not found.", { status: 404 })
    return apiJson({ object: "api_key", id, deleted: true })
  } catch (error) {
    return apiKeyStorageUnavailable("revoke", error)
  }
}

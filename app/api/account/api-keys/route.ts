import { apiError, apiJson, apiList, isResponse } from "@/lib/api-response"
import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  readAccountRouteJson,
  requireSignedInUser,
} from "@/lib/account-api-route.server"
import {
  createApiKeyForUser,
  listApiKeysForUser,
  normalizeApiKeyName,
  normalizeApiKeyPermission,
} from "@/lib/api-keys.server"

export const runtime = "nodejs"

function apiKeyStorageUnavailable(operation: string, error: unknown) {
  return accountRouteStorageUnavailable({
    error,
    logName: "apiKeys",
    message: "API key storage is unavailable.",
    operation,
  })
}

export async function GET(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to manage API keys.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "api-key-management", key: `user:${actor.user.id}` })
  if (rateLimit) return rateLimit

  try {
    const apiKeys = await listApiKeysForUser(actor.user)
    return apiJson(apiList(apiKeys), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return apiKeyStorageUnavailable("list", error)
  }
}

export async function POST(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to manage API keys.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "api-key-management", key: `user:${actor.user.id}` })
  if (rateLimit) return rateLimit

  const body = await readAccountRouteJson(req)
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

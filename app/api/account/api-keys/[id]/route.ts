import { apiError, apiJson, isResponse } from "@/lib/api-response"
import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  readAccountRouteJson,
  requireSignedInUser,
} from "@/lib/account-api-route.server"
import {
  normalizeApiKeyName,
  normalizeApiKeyPermission,
  revokeApiKeyForUser,
  updateApiKeyForUser,
} from "@/lib/api-keys.server"

export const runtime = "nodejs"

type ApiKeyRouteContext = {
  params: Promise<{ id: string }>
}

function apiKeyStorageUnavailable(operation: string, error: unknown) {
  return accountRouteStorageUnavailable({
    error,
    logName: "apiKeys",
    message: "API key storage is unavailable.",
    operation,
  })
}

export async function PATCH(req: Request, context: ApiKeyRouteContext) {
  const actor = await requireSignedInUser(req, "Sign in to manage API keys.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "api-key-management", key: `user:${actor.user.id}` })
  if (rateLimit) return rateLimit

  const body = await readAccountRouteJson(req)
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
  const actor = await requireSignedInUser(req, "Sign in to manage API keys.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "api-key-management", key: `user:${actor.user.id}` })
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

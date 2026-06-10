import { getCurrentActor } from "@/lib/actor.server"
import { apiError, apiJson, isResponse } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"
import { checkRateLimit } from "@/lib/rate-limit.server"
import {
  WEBHOOK_UPDATE_SCHEMA,
  WebhookUrlSecurityError,
  disableWebhookEndpointForUser,
  updateWebhookEndpointForUser,
} from "@/lib/webhooks.server"

export const runtime = "nodejs"

type WebhookRouteContext = {
  params: Promise<{ id: string }>
}

async function signedInUser(req: Request): Promise<UserActor | Response> {
  try {
    const actor = await getCurrentActor({ request: req })
    if (actor.kind === "user") return actor
  } catch {}
  return apiError("unauthorized", "Sign in to manage webhooks.", { status: 401 })
}

async function enforceManagementRateLimit(userId: string) {
  try {
    const rateLimit = await checkRateLimit("webhook-management", `user:${userId}`)
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

function webhookStorageUnavailable(operation: string, error: unknown) {
  console.error(`[tickward] webhooks.${operation}`, error)
  return apiError("storage_unavailable", "Webhook storage is unavailable.", { status: 503 })
}

function webhookUpdateError(error: unknown) {
  if (error instanceof WebhookUrlSecurityError) {
    return apiError("validation_error", error.message, { status: 400 })
  }
  return webhookStorageUnavailable("update", error)
}

export async function PATCH(req: Request, context: WebhookRouteContext) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = WEBHOOK_UPDATE_SCHEMA.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "We found an error with one or more fields in the request.", {
      details: parsed.error.issues,
      status: 400,
    })
  }

  const { id } = await context.params
  try {
    const updated = await updateWebhookEndpointForUser({
      eventTypes: parsed.data.event_types,
      id,
      name: parsed.data.name,
      status: parsed.data.status,
      url: parsed.data.url,
      user: actor.user,
    })
    if (!updated) return apiError("not_found", "Webhook endpoint not found.", { status: 404 })
    return apiJson(updated)
  } catch (error) {
    return webhookUpdateError(error)
  }
}

export async function DELETE(req: Request, context: WebhookRouteContext) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  const { id } = await context.params
  try {
    const disabled = await disableWebhookEndpointForUser({ id, user: actor.user })
    if (!disabled) return apiError("not_found", "Webhook endpoint not found.", { status: 404 })
    return apiJson({ ...disabled, disabled: true })
  } catch (error) {
    return webhookStorageUnavailable("disable", error)
  }
}

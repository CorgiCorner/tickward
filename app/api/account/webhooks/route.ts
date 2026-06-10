import { getCurrentActor } from "@/lib/actor.server"
import { apiError, apiJson, apiList, isResponse } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"
import { checkRateLimit } from "@/lib/rate-limit.server"
import {
  WEBHOOK_CREATE_SCHEMA,
  WebhookEndpointLimitError,
  WebhookUrlSecurityError,
  createWebhookEndpointForUser,
  listWebhookEndpointsForUser,
} from "@/lib/webhooks.server"

export const runtime = "nodejs"

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

function webhookCreateError(error: unknown) {
  if (error instanceof WebhookUrlSecurityError) {
    return apiError("validation_error", error.message, { status: 400 })
  }
  if (error instanceof WebhookEndpointLimitError) {
    return apiError("limit_exceeded", error.message, { status: 409 })
  }
  return webhookStorageUnavailable("create", error)
}

export async function GET(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  try {
    const endpoints = await listWebhookEndpointsForUser(actor.user)
    return apiJson(apiList(endpoints), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return webhookStorageUnavailable("list", error)
  }
}

export async function POST(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceManagementRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = WEBHOOK_CREATE_SCHEMA.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "We found an error with one or more fields in the request.", {
      details: parsed.error.issues,
      status: 400,
    })
  }

  try {
    const created = await createWebhookEndpointForUser({
      eventTypes: parsed.data.event_types,
      name: parsed.data.name,
      url: parsed.data.url,
      user: actor.user,
    })
    return apiJson(created, { status: 201 })
  } catch (error) {
    return webhookCreateError(error)
  }
}

import { apiError, apiJson, apiList, isResponse } from "@/lib/api-response"
import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  readAccountRouteJson,
  requireSignedInUser,
} from "@/lib/account-api-route.server"
import {
  WEBHOOK_CREATE_SCHEMA,
  WebhookEndpointLimitError,
  WebhookUrlSecurityError,
  createWebhookEndpointForUser,
  listWebhookEndpointsForUser,
} from "@/lib/webhooks.server"

export const runtime = "nodejs"

function webhookStorageUnavailable(operation: string, error: unknown) {
  return accountRouteStorageUnavailable({
    error,
    logName: "webhooks",
    message: "Webhook storage is unavailable.",
    operation,
  })
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
  const actor = await requireSignedInUser(req, "Sign in to manage webhooks.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "webhook-management", key: `user:${actor.user.id}` })
  if (rateLimit) return rateLimit

  try {
    const endpoints = await listWebhookEndpointsForUser(actor.user)
    return apiJson(apiList(endpoints), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return webhookStorageUnavailable("list", error)
  }
}

export async function POST(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to manage webhooks.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "webhook-management", key: `user:${actor.user.id}` })
  if (rateLimit) return rateLimit

  const body = await readAccountRouteJson(req)
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

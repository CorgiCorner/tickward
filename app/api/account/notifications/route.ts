import { getCurrentActor } from "@/lib/actor.server"
import { apiError, apiJson, isResponse } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"
import { listInboxNotificationsForUser } from "@/lib/inbox.server"
import { checkRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

async function signedInUser(req: Request): Promise<UserActor | Response> {
  try {
    const actor = await getCurrentActor({ request: req })
    if (actor.kind === "user") return actor
  } catch {}
  return apiError("unauthorized", "Sign in to read notifications.", { status: 401 })
}

async function enforceInboxRateLimit(userId: string) {
  try {
    const rateLimit = await checkRateLimit("inbox", `user:${userId}`)
    if (rateLimit.allowed) return null
    return apiError("rate_limited", "Too many requests.", { headers: rateLimit.headers, status: 429 })
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }
}

function inboxStorageUnavailable(operation: string, error: unknown) {
  console.error(`[tickward] inbox.${operation}`, error)
  return apiError("storage_unavailable", "Notification storage is unavailable.", { status: 503 })
}

export async function GET(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceInboxRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  try {
    const cursor = new URL(req.url).searchParams.get("cursor")
    const notifications = await listInboxNotificationsForUser({ userId: actor.user.id, cursor })
    return apiJson(notifications, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return inboxStorageUnavailable("list", error)
  }
}

import { z } from "zod"

import { getCurrentActor } from "@/lib/actor.server"
import { apiError, apiJson, isResponse } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"
import { markInboxNotificationsReadForUser } from "@/lib/inbox.server"
import { checkRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

const markReadSchema = z
  .object({
    all: z.boolean().optional(),
    ids: z.array(z.string().min(1)).max(100).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.all === true || (value.ids?.length ?? 0) > 0) return
    ctx.addIssue({
      code: "custom",
      message: "Provide ids or all=true.",
      path: ["ids"],
    })
  })

async function signedInUser(req: Request): Promise<UserActor | Response> {
  try {
    const actor = await getCurrentActor({ request: req })
    if (actor.kind === "user") return actor
  } catch {}
  return apiError("unauthorized", "Sign in to update notifications.", { status: 401 })
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

async function readJson(req: Request) {
  try {
    return await req.json()
  } catch {
    return apiError("validation_error", "Request body must be valid JSON.", { status: 400 })
  }
}

function inboxStorageUnavailable(operation: string, error: unknown) {
  console.error(`[tickward] inbox.${operation}`, error)
  return apiError("storage_unavailable", "Notification storage is unavailable.", { status: 503 })
}

export async function POST(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const rateLimit = await enforceInboxRateLimit(actor.user.id)
  if (rateLimit) return rateLimit

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = markReadSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "We found an error with one or more fields in the request.", {
      details: parsed.error.issues.map((issue) => ({ message: issue.message, path: issue.path })),
      status: 400,
    })
  }

  try {
    const unreadCount = await markInboxNotificationsReadForUser({
      all: parsed.data.all === true,
      ids: parsed.data.ids ?? [],
      userId: actor.user.id,
    })
    return apiJson({ unread_count: unreadCount }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return inboxStorageUnavailable("markRead", error)
  }
}

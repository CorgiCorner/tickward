import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { getCurrentActor } from "@/lib/actor.server"
import { isValidRestoreKey } from "@/lib/project-model"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { webPushSubscriptionInputSchema } from "@/lib/schemas/push"
import { getServerAdapters } from "@/lib/server-adapters.server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson", { status: 400 })
  }

  const payload = body as { restoreKey?: unknown; subscription?: unknown }
  if (typeof payload.restoreKey !== "string" || !isValidRestoreKey(payload.restoreKey)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey", { status: 400 })
  }

  const parsed = webPushSubscriptionInputSchema.safeParse(payload.subscription)
  if (!parsed.success) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidPushSubscription, "errors.invalidPushSubscription", {
      status: 400,
    })
  }

  const repository = getServerAdapters().webPushSubscriptionRepository
  if (!repository) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.webPushNotConfigured, "errors.webPushNotConfigured", { status: 501 })
  }

  const actor = await getCurrentActor({ restoreKey: payload.restoreKey, request: req })
  await repository.upsertSubscription({
    actor,
    subscription: parsed.data,
    userAgent: req.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ ok: true })
}

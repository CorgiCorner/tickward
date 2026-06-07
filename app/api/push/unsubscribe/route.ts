import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { getCurrentActor } from "@/lib/actor.server"
import { isValidRestoreKey } from "@/lib/project-model"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { getServerAdapters } from "@/lib/server-adapters.server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson", { status: 400 })
  }

  const payload = body as { restoreKey?: unknown; endpoint?: unknown }
  if (typeof payload.restoreKey !== "string" || !isValidRestoreKey(payload.restoreKey)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey", { status: 400 })
  }
  if (typeof payload.endpoint !== "string" || payload.endpoint.length === 0) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidPushEndpoint, "errors.invalidPushEndpoint", { status: 400 })
  }

  const repository = getServerAdapters().webPushSubscriptionRepository
  if (!repository) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.webPushNotConfigured, "errors.webPushNotConfigured", { status: 501 })
  }

  const actor = await getCurrentActor({ restoreKey: payload.restoreKey, request: req })
  await repository.deleteSubscription({ actor, endpoint: payload.endpoint })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { enforceRateLimit } from "@/lib/rate-limit.server"
import { parseTimerShareOwner, resolveTimerShareActor, timerShareRateLimitKey } from "@/lib/share-request.server"
import { createTimerShare } from "@/lib/share-service.server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson", { status: 400 })
  }

  const owner = parseTimerShareOwner(body)
  if (!owner) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidShareOwner, "errors.invalidShareOwner", { status: 400 })
  }

  const rateLimitKey = timerShareRateLimitKey(owner)
  if (!rateLimitKey) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidShareOwner, "errors.invalidShareOwner", { status: 400 })
  }

  const rateLimitResponse = await enforceRateLimit("share-create", rateLimitKey)
  if (rateLimitResponse) return rateLimitResponse

  let actor
  try {
    actor = await resolveTimerShareActor(owner, req)
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }

  const result = await createTimerShare({
    actor,
    timerId: owner.timerId,
    projectId: owner.projectId ?? undefined,
  })
  if (!result) return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })

  return NextResponse.json(result)
}

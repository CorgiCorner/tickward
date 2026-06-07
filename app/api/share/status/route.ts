import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { parseTimerShareOwner, resolveTimerShareActor } from "@/lib/share-request.server"
import { getExistingTimerShare } from "@/lib/share-service.server"

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

  let actor
  try {
    actor = await resolveTimerShareActor(owner, req)
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }

  const result = await getExistingTimerShare({
    actor,
    timerId: owner.timerId,
    projectId: owner.projectId ?? undefined,
  })

  return NextResponse.json(result ?? { shareId: null, url: null })
}

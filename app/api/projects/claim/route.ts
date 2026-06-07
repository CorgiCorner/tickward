import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { getCurrentActor } from "@/lib/actor.server"
import { isValidRestoreKey } from "@/lib/project-model"
import { claimProject } from "@/lib/project-service.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "nodejs"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson", { status: 400 })
  }

  const payload = body as { restoreKey?: unknown }
  if (typeof payload.restoreKey !== "string" || !isValidRestoreKey(payload.restoreKey)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey", { status: 400 })
  }

  const actor = await getCurrentActor({ restoreKey: payload.restoreKey, request: req })
  const result = await claimProject({ actor, restoreKey: payload.restoreKey })

  if (result.status === "unauthenticated") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.claimSignInRequired, "errors.claimSignInRequired", { status: 401 })
  }

  if (result.status === "unsupported") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported", { status: 501 })
  }

  if (result.status === "not_found") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }

  return NextResponse.json({ ok: true, project: result.project })
}

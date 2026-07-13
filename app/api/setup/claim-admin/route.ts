import { NextResponse } from "next/server"

import { claimAdminBootstrap } from "@/lib/admin-bootstrap.server"
import { getCurrentActor } from "@/lib/actor.server"
import { apiErrorResponse } from "@/lib/api-error-response"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "nodejs"

export async function POST(req: Request) {
  let actor: Awaited<ReturnType<typeof getCurrentActor>>
  try {
    actor = await getCurrentActor({ request: req })
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }

  if (actor.kind !== "user") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }

  const claimed = await claimAdminBootstrap(actor.user.id)
  if (!claimed) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.adminAlreadyExists, "errors.adminAlreadyExists", { status: 409 })
  }
  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { publicServerErrorResponse } from "@/lib/api-server-errors"
import { getCurrentActor } from "@/lib/actor.server"
import type { Actor } from "@/lib/contracts"
import { listUserProjects } from "@/lib/project-service.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "nodejs"

type UserProjectListResult = Awaited<ReturnType<typeof listUserProjects>>

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

async function loadWithPublicServerErrors<T>(loader: () => Promise<T>): Promise<T | Response> {
  try {
    return await loader()
  } catch (error) {
    const response = publicServerErrorResponse(error)
    if (response) return response
    throw error
  }
}

export async function GET(req: Request) {
  let actor: Actor
  try {
    actor = await getCurrentActor({ request: req })
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }

  const result = await loadWithPublicServerErrors<UserProjectListResult>(() => listUserProjects(actor))
  if (isResponse(result)) return result

  if (result.status === "unauthenticated") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }
  if (result.status === "unsupported") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported", { status: 501 })
  }
  if (result.status === "not_found") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }

  return NextResponse.json(
    { projects: result.data },
    {
      headers: { "Cache-Control": "private, no-store" },
    },
  )
}

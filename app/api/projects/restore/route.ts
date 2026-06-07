import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { publicServerErrorResponse } from "@/lib/api-server-errors"
import { getCurrentActor } from "@/lib/actor.server"
import type { Actor } from "@/lib/contracts"
import { type ProjectRestoreResponse, isValidProjectId, isValidRestoreKey } from "@/lib/project-model"
import { loadProject, loadUserProject } from "@/lib/project-service.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "nodejs"

type AnonymousProjectRestoreResult = Awaited<ReturnType<typeof loadProject>>
type UserProjectRestoreResult = Awaited<ReturnType<typeof loadUserProject>>

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

function restoredProjectResponse(restored: ProjectRestoreResponse) {
  return NextResponse.json(restored, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
  })
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

async function restoreUserProjectRequest(req: Request, projectId: string) {
  let actor: Actor
  try {
    actor = await getCurrentActor({ request: req })
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }

  const restored = await loadWithPublicServerErrors<UserProjectRestoreResult>(() => loadUserProject(actor, projectId))
  if (isResponse(restored)) return restored

  if (restored.status === "unauthenticated") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }
  if (restored.status === "unsupported") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported", { status: 501 })
  }
  if (restored.status === "not_found") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }

  return restoredProjectResponse(restored.data)
}

async function restoreKeyProjectRequest(req: Request, key: string) {
  let actor: Actor
  try {
    actor = await getCurrentActor({ restoreKey: key, request: req })
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }

  const restored = await loadWithPublicServerErrors<AnonymousProjectRestoreResult>(() => loadProject(actor))
  if (isResponse(restored)) return restored
  if (!restored) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }

  return restoredProjectResponse(restored)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get("key")
  const projectId = searchParams.get("projectId")

  if (projectId) {
    if (!isValidProjectId(projectId)) {
      return apiErrorResponse(PUBLIC_ERROR_CODES.invalidProjectId, "errors.invalidProjectId", { status: 400 })
    }

    return restoreUserProjectRequest(req, projectId)
  }

  if (!key || !isValidRestoreKey(key)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey", { status: 400 })
  }

  return restoreKeyProjectRequest(req, key)
}

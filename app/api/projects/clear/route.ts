import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { publicServerErrorResponse } from "@/lib/api-server-errors"
import { getCurrentActor } from "@/lib/actor.server"
import type { Actor } from "@/lib/contracts"
import { isValidProjectId, isValidRestoreKey } from "@/lib/project-model"
import { clearProject, clearUserProject } from "@/lib/project-service.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { enforceRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

type ClearRequest =
  | {
      kind: "user-project"
      projectId: string
    }
  | {
      kind: "restore-key"
      restoreKey: string
    }

function clearRateLimitKey(actor: Actor, projectId: string) {
  return actor.kind === "user" ? `user:${actor.user.id}:project:${projectId}` : `project:${projectId}`
}

function parseClearRequest(req: Request): ClearRequest | Response {
  const { searchParams } = new URL(req.url)
  const restoreKey = searchParams.get("key")
  const projectId = searchParams.get("projectId")

  if (projectId && !isValidProjectId(projectId)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidProjectId, "errors.invalidProjectId", { status: 400 })
  }
  if (projectId) return { kind: "user-project", projectId }

  if (!restoreKey || !isValidRestoreKey(restoreKey)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey", { status: 400 })
  }
  return { kind: "restore-key", restoreKey }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

async function authenticatedActor(req: Request): Promise<Actor | Response> {
  try {
    return await getCurrentActor({ request: req })
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }
}

function clearUserProjectResponse(cleared: Awaited<ReturnType<typeof clearUserProject>>) {
  if (cleared.status === "unauthenticated") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }
  if (cleared.status === "unsupported") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported", { status: 501 })
  }
  if (cleared.status === "not_found") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

async function clearUserProjectRequest(req: Request, input: Extract<ClearRequest, { kind: "user-project" }>) {
  const actor = await authenticatedActor(req)
  if (isResponse(actor)) return actor

  const rateLimitResponse = await enforceRateLimit("clear", clearRateLimitKey(actor, input.projectId))
  if (rateLimitResponse) return rateLimitResponse

  try {
    return clearUserProjectResponse(await clearUserProject(actor, input.projectId))
  } catch (error) {
    const response = publicServerErrorResponse(error)
    if (response) return response
    throw error
  }
}

async function clearRestoreKeyProjectRequest(req: Request, input: Extract<ClearRequest, { kind: "restore-key" }>) {
  const rateLimitResponse = await enforceRateLimit("clear", input.restoreKey)
  if (rateLimitResponse) return rateLimitResponse

  const actor = await getCurrentActor({ restoreKey: input.restoreKey, request: req })
  try {
    await clearProject(actor)
  } catch (error) {
    const response = publicServerErrorResponse(error)
    if (response) return response
    throw error
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const input = parseClearRequest(req)
  if (isResponse(input)) return input

  if (input.kind === "user-project") return clearUserProjectRequest(req, input)
  return clearRestoreKeyProjectRequest(req, input)
}

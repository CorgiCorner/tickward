import { NextResponse } from "next/server"

import { getCurrentActor } from "@/lib/actor.server"
import { apiErrorResponse, publicErrorResponse } from "@/lib/api-error-response"
import { publicServerErrorResponse } from "@/lib/api-server-errors"
import type { Actor } from "@/lib/contracts"
import { getEntitlementsForActor } from "@/lib/entitlements.server"
import {
  type ProjectSnapshotV2,
  isProjectSnapshot,
  isValidProjectId,
  isValidRestoreKey,
  validateProjectSnapshot,
} from "@/lib/project-model"
import { saveProject, saveUserProject } from "@/lib/project-service.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { enforceRateLimit } from "@/lib/rate-limit.server"

export const runtime = "nodejs"

type SavePayload = {
  key?: unknown
  projectId?: unknown
  project?: unknown
  baseUpdatedAt?: unknown
  force?: unknown
}

type SaveInput = {
  baseUpdatedAt: string | null
  force: boolean
  project: ProjectSnapshotV2
}

type ValidSaveRequest =
  | ({ kind: "user-project"; projectId: string } & SaveInput)
  | ({ kind: "restore-key"; restoreKey: string } & SaveInput)

async function readSavePayload(req: Request): Promise<SavePayload | Response> {
  try {
    return (await req.json()) as SavePayload
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson", { status: 400 })
  }
}

function validateSavePayload(payload: SavePayload): ValidSaveRequest | Response {
  const hasProjectId = typeof payload.projectId === "string"
  const hasRestoreKey = typeof payload.key === "string"

  if (!hasProjectId && (!hasRestoreKey || !isValidRestoreKey(payload.key as string))) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey", { status: 400 })
  }
  if (hasProjectId && !isValidProjectId(payload.projectId as string)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidProjectId, "errors.invalidProjectId", { status: 400 })
  }
  if (!isProjectSnapshot(payload.project)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidProjectPayload, "errors.invalidProjectPayload", { status: 400 })
  }

  const project: ProjectSnapshotV2 = payload.project
  const input = {
    project,
    baseUpdatedAt: typeof payload.baseUpdatedAt === "string" ? payload.baseUpdatedAt : null,
    force: payload.force === true,
  }

  if (hasProjectId) return { kind: "user-project", projectId: payload.projectId as string, ...input }
  return { kind: "restore-key", restoreKey: payload.key as string, ...input }
}

async function validateProjectForActor(project: ProjectSnapshotV2, actor: Actor): Promise<Response | null> {
  const validationError = validateProjectSnapshot(project, await getEntitlementsForActor(actor))
  return validationError ? publicErrorResponse(validationError, { status: 400 }) : null
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

function projectWriteRateLimitKey(actor: Actor, projectId: string) {
  return actor.kind === "user" ? `user:${actor.user.id}:project:${projectId}` : `project:${projectId}`
}

function savedProjectResponse(result: Awaited<ReturnType<typeof saveProject>>) {
  if (result.status === "not_found") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }
  // read_only cannot occur on the anonymous restore-key path, but the shared
  // SaveProjectResult type includes it for the user path; guard to satisfy TS.
  if (result.status === "read_only") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.projectReadOnly, "errors.projectReadOnly", { status: 403 })
  }
  if (result.status === "conflict") {
    return NextResponse.json({ conflict: true, project: result.project, source: result.source }, { status: 409 })
  }
  return NextResponse.json({ ok: true, project: result.project })
}

function savedUserProjectResponse(result: Awaited<ReturnType<typeof saveUserProject>>) {
  if (result.status === "unauthenticated") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }
  if (result.status === "unsupported") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported", { status: 501 })
  }
  if (result.status === "not_found") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }
  if (result.data.status === "not_found") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }
  if (result.data.status === "read_only") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.projectReadOnly, "errors.projectReadOnly", { status: 403 })
  }
  if (result.data.status === "conflict") {
    return NextResponse.json(
      { conflict: true, project: result.data.project, source: result.data.source },
      { status: 409 },
    )
  }
  return NextResponse.json({ ok: true, project: result.data.project })
}

async function saveUserProjectRequest(req: Request, input: Extract<ValidSaveRequest, { kind: "user-project" }>) {
  const actor = await authenticatedActor(req)
  if (isResponse(actor)) return actor

  const validationError = await validateProjectForActor(input.project, actor)
  if (validationError) return validationError

  const rateLimitResponse = await enforceRateLimit("write", projectWriteRateLimitKey(actor, input.projectId))
  if (rateLimitResponse) return rateLimitResponse

  try {
    return savedUserProjectResponse(await saveUserProject(actor, input.projectId, saveInputFromRequest(input)))
  } catch (error) {
    const response = publicServerErrorResponse(error)
    if (response) return response
    throw error
  }
}

async function saveRestoreKeyProjectRequest(req: Request, input: Extract<ValidSaveRequest, { kind: "restore-key" }>) {
  let actor: Actor
  try {
    actor = await getCurrentActor({
      restoreKey: input.restoreKey,
      request: req,
    })
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired", { status: 401 })
  }

  const validationError = await validateProjectForActor(input.project, actor)
  if (validationError) return validationError

  const rateLimitResponse = await enforceRateLimit("write", input.restoreKey)
  if (rateLimitResponse) return rateLimitResponse

  try {
    return savedProjectResponse(await saveProject({ actor, ...saveInputFromRequest(input) }))
  } catch (error) {
    const response = publicServerErrorResponse(error)
    if (response) return response
    throw error
  }
}

function saveInputFromRequest(input: ValidSaveRequest): SaveInput {
  return {
    baseUpdatedAt: input.baseUpdatedAt,
    force: input.force,
    project: input.project,
  }
}

export async function POST(req: Request) {
  const payload = await readSavePayload(req)
  if (isResponse(payload)) return payload

  const input = validateSavePayload(payload)
  if (isResponse(input)) return input

  if (input.kind === "user-project") return saveUserProjectRequest(req, input)
  return saveRestoreKeyProjectRequest(req, input)
}

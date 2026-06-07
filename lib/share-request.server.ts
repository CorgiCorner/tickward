import "server-only"

import { getCurrentActor } from "@/lib/actor.server"
import type { Actor } from "@/lib/contracts"
import { isValidProjectId } from "@/lib/project-model"
import { isValidRestoreKey } from "@/lib/share-model"

export type ParsedTimerShareOwner = {
  projectId: string | null
  restoreKey: string | null
  timerId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isValidLocalTimerId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}

export function parseTimerShareOwner(body: unknown): ParsedTimerShareOwner | null {
  if (!isRecord(body) || !isRecord(body.owner)) return null

  const timerId = body.owner.timerId
  const restoreKey =
    typeof body.owner.restoreKey === "string" && isValidRestoreKey(body.owner.restoreKey) ? body.owner.restoreKey : null
  const projectId =
    typeof body.owner.projectId === "string" && isValidProjectId(body.owner.projectId) ? body.owner.projectId : null

  if (!isValidLocalTimerId(timerId) || (!restoreKey && !projectId)) return null

  return { projectId, restoreKey, timerId }
}

export function timerShareRateLimitKey(owner: ParsedTimerShareOwner) {
  return owner.projectId ? `project:${owner.projectId}` : owner.restoreKey
}

export async function resolveTimerShareActor(owner: ParsedTimerShareOwner, request: Request): Promise<Actor> {
  return getCurrentActor(owner.projectId ? { request } : { restoreKey: owner.restoreKey, request })
}

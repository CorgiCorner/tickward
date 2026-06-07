import "server-only"

import type { Actor } from "@/lib/contracts"
import type { TimerShareAccess } from "@/lib/repositories"
import type { ResolvedShare } from "@/lib/share-model"
import { getServerAdapters } from "@/lib/server-adapters.server"
import { stableShareId } from "@/lib/static-share-id.server"

export type CreateTimerShareInput = {
  actor: Actor
  timerId: string
  projectId?: string
}

export type CreateTimerShareResult = {
  shareId: string
  url: string
}

function timerShareAccess(input: CreateTimerShareInput): TimerShareAccess | null {
  if (input.projectId) {
    if (input.actor.kind !== "user") return null
    return { kind: "user-project", projectId: input.projectId, user: input.actor.user }
  }

  if (input.actor.kind === "anonymous") return { kind: "restore-key", restoreKey: input.actor.restoreKey }
  if (input.actor.restoreKey) return { kind: "restore-key", restoreKey: input.actor.restoreKey }
  return null
}

function timerShareLocation(input: CreateTimerShareInput) {
  const access = timerShareAccess(input)
  if (!access) return null

  const entityId = input.projectId ? `${input.projectId}:${input.timerId}` : input.timerId
  const shareId = stableShareId({ actor: input.actor, entityId, kind: "timer" })
  return { access, shareId, url: `/share/${shareId}` }
}

export async function createTimerShare(input: CreateTimerShareInput): Promise<CreateTimerShareResult | null> {
  const location = timerShareLocation(input)
  if (!location) return null

  const published = await getServerAdapters().shareRepository.publishTimer({
    access: location.access,
    shareId: location.shareId,
    timerId: input.timerId,
    sharedAt: new Date().toISOString(),
  })
  if (!published) return null

  return { shareId: location.shareId, url: location.url }
}

export async function getExistingTimerShare(input: CreateTimerShareInput): Promise<CreateTimerShareResult | null> {
  const location = timerShareLocation(input)
  if (!location) return null

  const shareRepository = getServerAdapters().shareRepository
  const exists = await shareRepository.hasPublishedTimer({
    access: location.access,
    shareId: location.shareId,
    timerId: input.timerId,
  })
  if (exists) return { shareId: location.shareId, url: location.url }

  const published = await shareRepository.findPublishedTimer({
    access: location.access,
    timerId: input.timerId,
  })
  return published ? { shareId: published.shareId, url: `/share/${published.shareId}` } : null
}

export async function resolveTimerShare(shareId: string): Promise<ResolvedShare | null> {
  return getServerAdapters().shareRepository.resolve(shareId)
}

export async function resolveTimerShareBatch(shareIds: string[]): Promise<Map<string, ResolvedShare | null>> {
  return getServerAdapters().shareRepository.resolveBatch(shareIds)
}

import "server-only"

import type { Actor } from "@/lib/contracts"
import { getRedis } from "@/lib/redis"
import type { TimerShareAccess } from "@/lib/repositories"
import type { ResolvedShare } from "@/lib/share-model"
import { getServerAdapters } from "@/lib/server-adapters.server"
import { stableShareId } from "@/lib/static-share-id.server"

// Share resolution is read-only and identical for a given id between edits, but
// every embed page load and state poll otherwise issues two Postgres queries
// (share + timer). A short Redis read-through cache collapses repeated reads of
// the same share - the dominant load when a timer is embedded on a busy host
// page - to one DB round-trip per window. Staleness is bounded by the TTL, in
// line with the embed contract's own 60s cache window; a revoked or edited
// share propagates within that window. Negative results are cached briefly so a
// flood of valid-format-but-missing ids cannot hammer the DB.
const RESOLVE_CACHE_PREFIX = "tickward:share:resolve:"
const RESOLVE_CACHE_TTL_SECONDS = 30
const RESOLVE_CACHE_MISS_TTL_SECONDS = 10

type ResolveCacheEntry = { v: ResolvedShare | null }

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

// Thrown when an anonymous actor tries to share a timer that carries a link.
// Links may only be shared by signed-in users.
export class TimerShareLinkRequiresAuthError extends Error {
  constructor() {
    super("Sharing a timer with a link requires sign in")
    this.name = "TimerShareLinkRequiresAuthError"
  }
}

export async function createTimerShare(input: CreateTimerShareInput): Promise<CreateTimerShareResult | null> {
  const location = timerShareLocation(input)
  if (!location) return null

  const shareRepository = getServerAdapters().shareRepository

  if (input.actor.kind !== "user") {
    const timer = await shareRepository.findTimerForShare({ timerId: input.timerId, access: location.access })
    if (timer?.url) throw new TimerShareLinkRequiresAuthError()
  }

  const published = await shareRepository.publishTimer({
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
  const cacheKey = `${RESOLVE_CACHE_PREFIX}${shareId}`

  try {
    const cached = await getRedis().get<ResolveCacheEntry>(cacheKey)
    if (cached) return cached.v
  } catch {
    // Fail open: a Redis hiccup (or no Redis configured locally) must never
    // break a read path. Fall through to the database.
  }

  const resolved = await getServerAdapters().shareRepository.resolve(shareId)

  try {
    await getRedis().set<ResolveCacheEntry>(
      cacheKey,
      { v: resolved },
      { ex: resolved ? RESOLVE_CACHE_TTL_SECONDS : RESOLVE_CACHE_MISS_TTL_SECONDS },
    )
  } catch {
    // Best-effort cache population; never fail the request on a write error.
  }

  return resolved
}

export async function resolveTimerShareBatch(shareIds: string[]): Promise<Map<string, ResolvedShare | null>> {
  return getServerAdapters().shareRepository.resolveBatch(shareIds)
}

import { markActiveProjectChanged } from "@/lib/stores/timer-store-domain"
import type { TimerStore } from "@/lib/stores/timer-store-types"
import type { Timer } from "@/lib/types"

export type ShareBatchResult = {
  id: string
  timer?: Partial<Timer>
  status: "ok" | "not_found" | "error"
}

export function followedShareIds(timers: Timer[]) {
  const shareIds: string[] = []
  for (const timer of timers) {
    if (timer.sourceShareId) shareIds.push(timer.sourceShareId)
  }
  return shareIds
}

async function fetchShareFallback(shareId: string): Promise<ShareBatchResult> {
  try {
    const res = await fetch(`/api/share/resolve?id=${encodeURIComponent(shareId)}`, {
      method: "GET",
      cache: "no-store",
    })
    if (res.status === 404 || res.status === 410) return { id: shareId, status: "not_found" }
    if (!res.ok) return { id: shareId, status: "error" }

    const data = (await res.json()) as { timer?: Partial<Timer> }
    return { id: shareId, timer: data?.timer, status: "ok" }
  } catch {
    return { id: shareId, status: "error" }
  }
}

async function fetchShareFallbacks(shareIds: string[]) {
  const results: ShareBatchResult[] = []
  for (const shareId of shareIds) {
    results.push(await fetchShareFallback(shareId))
  }
  return results
}

async function fetchShareBatch(shareIds: string[]) {
  const res = await fetch("/api/share/resolve-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: shareIds }),
  })
  if (!res.ok) throw new Error("batch_failed")

  const data = (await res.json()) as { results: ShareBatchResult[] }
  return data.results
}

export async function fetchFollowedTimerResults(shareIds: string[]) {
  try {
    return await fetchShareBatch(shareIds)
  } catch {
    return fetchShareFallbacks(shareIds)
  }
}

function findTimerByShareId(timers: Timer[], shareId: string) {
  for (const timer of timers) {
    if (timer.sourceShareId === shareId) return timer
  }
  return undefined
}

function applySharedTimerUpdate(local: Timer, result: ShareBatchResult, nowIso: string) {
  if (result.status === "not_found") {
    local.sourceShareId = undefined
    local.lastSyncAt = undefined
    return true
  }

  if (result.status === "error" || !result.timer) return false

  local.lastSyncAt = nowIso

  const nextLabel = typeof result.timer.label === "string" ? result.timer.label : local.label
  const nextTarget = typeof result.timer.targetDate === "string" ? result.timer.targetDate : local.targetDate
  const nextTz = typeof result.timer.timezone === "string" ? result.timer.timezone : local.timezone
  const nextColor = typeof result.timer.color === "string" ? result.timer.color : local.color

  if (
    nextLabel === local.label &&
    nextTarget === local.targetDate &&
    nextTz === local.timezone &&
    nextColor === local.color
  ) {
    return false
  }

  local.label = nextLabel
  local.targetDate = nextTarget
  local.timezone = nextTz
  local.color = nextColor
  return true
}

export function applyFollowedTimerResults(state: TimerStore, results: ShareBatchResult[], nowIso: string) {
  let changed = false
  for (const result of results) {
    const local = findTimerByShareId(state.timers, result.id)
    if (!local) continue
    changed = applySharedTimerUpdate(local, result, nowIso) || changed
  }
  if (changed) markActiveProjectChanged(state, nowIso)
  return changed
}

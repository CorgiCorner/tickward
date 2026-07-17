"use client"

import { countUpPolicyDurationMs, normalizeCountUpPolicy, type CountUpPolicy } from "@/lib/count-up-policy"

export type CountUpOccurrence = {
  key: string
  projectId?: string
  projectName?: string
  timer?: {
    label: string
    pinned: boolean
  }
  timerId: string
  targetAtMs: number
  crossedAt: number
  firstSeenAt: number | null
  reviewExpiresAt: number | null
  acknowledgedAt: number | null
  deferredUntil: number | null
  policy?: CountUpPolicy
  usesDefaultPolicy: boolean
}

export type CountUpObservation = {
  timerId: string
  targetAtMs: number
  observedAt: number
}

export type CountUpStore = {
  occurrences: CountUpOccurrence[]
  observations: CountUpObservation[]
}

export type CountUpStoreSnapshot = CountUpStore

type CountUpWireOccurrence = {
  key?: string
  projectId?: string
  projectName?: string
  timer?: {
    label: string
    pinned: boolean
  }
  timerId: string
  targetAtMs: string
  crossedAt: string
  firstSeenAt: string | null
  reviewExpiresAt: string | null
  acknowledgedAt: string | null
  deferredUntil: string | null
  policy: CountUpPolicy
  usesDefaultPolicy: boolean
}

export type CountUpActionBody =
  | { action: "create"; events: CountUpWireOccurrence[] }
  | {
      action: "markSeen" | "acknowledge" | "unacknowledge" | "close"
      keys: string[]
      projectId?: string
    }
  | { action: "defer"; keys: string[]; untilMs: number | null; projectId?: string }

// This storage key is a persistence contract. The domain name changed, the
// already-written browser data did not.
export const COUNT_UP_STORAGE_PREFIX = "td_timer_attention_v1:"

export function getCountUpOccurrenceKey(timerId: string, targetAtMs: number) {
  return `${timerId}|${targetAtMs}`
}

export function countUpOccurrencesForProject(occurrences: CountUpOccurrence[], projectId: string) {
  return occurrences.filter((occurrence) => occurrence.projectId === projectId)
}

export function activeCountUpCountsByProject(occurrences: CountUpOccurrence[]) {
  const counts = new Map<string, number>()
  for (const occurrence of occurrences) {
    if (!occurrence.projectId || occurrence.acknowledgedAt !== null) continue
    counts.set(occurrence.projectId, (counts.get(occurrence.projectId) ?? 0) + 1)
  }
  return counts
}

function finiteTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
  return value
}

function nullableTimestamp(value: unknown): number | null {
  return value === null ? null : finiteTimestamp(value)
}

function normalizeOccurrence(
  value: unknown,
  project?: { projectId?: string; projectName?: string },
): CountUpOccurrence | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<CountUpOccurrence>
  if (typeof candidate.timerId !== "string" || !candidate.timerId) return null
  const targetAtMs = finiteTimestamp(candidate.targetAtMs)
  const crossedAt = finiteTimestamp(candidate.crossedAt)
  if (targetAtMs === null || crossedAt === null) return null
  const key = getCountUpOccurrenceKey(candidate.timerId, targetAtMs)
  const firstSeenAt = nullableTimestamp(candidate.firstSeenAt)
  const deferredUntil = nullableTimestamp(candidate.deferredUntil)
  const policy = normalizeCountUpPolicy(candidate.policy)
  const storedReviewExpiresAt = nullableTimestamp(candidate.reviewExpiresAt)
  const durationMs = countUpPolicyDurationMs(policy)
  const reviewExpiresAt =
    candidate.reviewExpiresAt === undefined && firstSeenAt !== null
      ? (deferredUntil ?? (durationMs === null ? null : firstSeenAt + durationMs))
      : storedReviewExpiresAt
  const projectId =
    typeof candidate.projectId === "string" && candidate.projectId ? candidate.projectId : project?.projectId
  const projectName =
    typeof candidate.projectName === "string" && candidate.projectName ? candidate.projectName : project?.projectName
  const timer =
    candidate.timer &&
    typeof candidate.timer === "object" &&
    typeof candidate.timer.label === "string" &&
    typeof candidate.timer.pinned === "boolean"
      ? { label: candidate.timer.label, pinned: candidate.timer.pinned }
      : undefined
  return {
    key,
    ...(projectId ? { projectId } : {}),
    ...(projectName ? { projectName } : {}),
    ...(timer ? { timer } : {}),
    timerId: candidate.timerId,
    targetAtMs,
    crossedAt,
    firstSeenAt,
    reviewExpiresAt,
    acknowledgedAt: nullableTimestamp(candidate.acknowledgedAt),
    deferredUntil,
    policy,
    usesDefaultPolicy: candidate.usesDefaultPolicy !== false,
  }
}

function normalizeObservation(value: unknown): CountUpObservation | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<CountUpObservation>
  if (typeof candidate.timerId !== "string" || !candidate.timerId) return null
  const targetAtMs = finiteTimestamp(candidate.targetAtMs)
  const observedAt = finiteTimestamp(candidate.observedAt)
  if (targetAtMs === null || observedAt === null) return null
  return { timerId: candidate.timerId, targetAtMs, observedAt }
}

export function countUpStorageKey(projectId: string) {
  return `${COUNT_UP_STORAGE_PREFIX}${projectId}`
}

export function readCountUpState(
  projectId: string,
  storage = globalThis.localStorage,
  projectName?: string,
): CountUpStoreSnapshot {
  if (globalThis.window === undefined) return { occurrences: [], observations: [] }
  try {
    const currentKey = countUpStorageKey(projectId)
    const currentValue = storage.getItem(currentKey)
    const parsed = JSON.parse(currentValue ?? "null") as {
      occurrences?: unknown[]
      events?: unknown[]
      observations?: unknown[]
    } | null
    if (!parsed) return { occurrences: [], observations: [] }
    return {
      occurrences: (parsed.occurrences ?? parsed.events ?? [])
        .map((occurrence) => normalizeOccurrence(occurrence, { projectId, projectName }))
        .filter((occurrence): occurrence is CountUpOccurrence => occurrence !== null),
      observations: (parsed.observations ?? [])
        .map(normalizeObservation)
        .filter((observation): observation is CountUpObservation => observation !== null),
    }
  } catch {
    return { occurrences: [], observations: [] }
  }
}

export function countUpStorageProjectIds(storage = globalThis.localStorage): string[] {
  if (globalThis.window === undefined) return []
  const projectIds = new Set<string>()
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    const prefix = key?.startsWith(COUNT_UP_STORAGE_PREFIX) ? COUNT_UP_STORAGE_PREFIX : null
    if (!key || !prefix) continue
    const projectId = key.slice(prefix.length)
    if (projectId) projectIds.add(projectId)
  }
  return [...projectIds]
}

export function writeCountUpState(projectId: string, state: CountUpStoreSnapshot, storage = globalThis.localStorage) {
  if (globalThis.window === undefined) return
  storage.setItem(countUpStorageKey(projectId), JSON.stringify(state))
}

export function removeCountUpState(projectId: string, storage = globalThis.localStorage) {
  if (globalThis.window === undefined) return
  storage.removeItem(countUpStorageKey(projectId))
}

function earliestNullable(left: number | null, right: number | null) {
  if (left === null) return right
  if (right === null) return left
  return Math.min(left, right)
}

function latestNullable(left: number | null, right: number | null) {
  if (left === null) return right
  if (right === null) return left
  return Math.max(left, right)
}

export function mergeCountUpOccurrences(local: CountUpOccurrence[], remote: CountUpOccurrence[]): CountUpOccurrence[] {
  const merged = new Map<string, CountUpOccurrence>()
  for (const occurrence of [...local, ...remote]) {
    const identity = `${occurrence.projectId ?? ""}\u0000${occurrence.key}`
    const existing = merged.get(identity)
    if (!existing) {
      merged.set(identity, occurrence)
      continue
    }
    merged.set(identity, {
      ...existing,
      projectId: occurrence.projectId ?? existing.projectId,
      projectName: occurrence.projectName ?? existing.projectName,
      timer: occurrence.timer ?? existing.timer,
      crossedAt: Math.min(existing.crossedAt, occurrence.crossedAt),
      firstSeenAt: earliestNullable(existing.firstSeenAt, occurrence.firstSeenAt),
      reviewExpiresAt: occurrence.reviewExpiresAt,
      acknowledgedAt: latestNullable(existing.acknowledgedAt, occurrence.acknowledgedAt),
      deferredUntil: latestNullable(existing.deferredUntil, occurrence.deferredUntil),
      policy: normalizeCountUpPolicy(occurrence.policy ?? existing.policy),
      usesDefaultPolicy: occurrence.usesDefaultPolicy,
    })
  }
  return [...merged.values()]
}

function wireDate(value: number | null) {
  return value === null ? null : new Date(value).toISOString()
}

export function countUpOccurrenceToWire(occurrence: CountUpOccurrence): CountUpWireOccurrence {
  return {
    key: occurrence.key,
    ...(occurrence.projectId ? { projectId: occurrence.projectId } : {}),
    ...(occurrence.projectName ? { projectName: occurrence.projectName } : {}),
    ...(occurrence.timer ? { timer: occurrence.timer } : {}),
    timerId: occurrence.timerId,
    targetAtMs: String(occurrence.targetAtMs),
    crossedAt: new Date(occurrence.crossedAt).toISOString(),
    firstSeenAt: wireDate(occurrence.firstSeenAt),
    reviewExpiresAt: wireDate(occurrence.reviewExpiresAt),
    acknowledgedAt: wireDate(occurrence.acknowledgedAt),
    deferredUntil: wireDate(occurrence.deferredUntil),
    policy: normalizeCountUpPolicy(occurrence.policy),
    usesDefaultPolicy: occurrence.usesDefaultPolicy,
  }
}

function occurrenceFromWire(value: unknown): CountUpOccurrence | null {
  if (!value || typeof value !== "object") return null
  const occurrence = value as Partial<CountUpWireOccurrence>
  if (
    typeof occurrence.timerId !== "string" ||
    typeof occurrence.targetAtMs !== "string" ||
    typeof occurrence.crossedAt !== "string"
  ) {
    return null
  }
  const targetAtMs = Number(occurrence.targetAtMs)
  const crossedAt = Date.parse(occurrence.crossedAt)
  const parseNullable = (date: unknown) => (typeof date === "string" ? Date.parse(date) : null)
  return normalizeOccurrence({
    projectId: occurrence.projectId,
    projectName: occurrence.projectName,
    timer: occurrence.timer,
    timerId: occurrence.timerId,
    targetAtMs,
    crossedAt,
    firstSeenAt: parseNullable(occurrence.firstSeenAt),
    ...(occurrence.reviewExpiresAt === undefined ? {} : { reviewExpiresAt: parseNullable(occurrence.reviewExpiresAt) }),
    acknowledgedAt: parseNullable(occurrence.acknowledgedAt),
    deferredUntil: parseNullable(occurrence.deferredUntil),
    policy: occurrence.policy,
    ...(occurrence.usesDefaultPolicy === undefined ? {} : { usesDefaultPolicy: occurrence.usesDefaultPolicy }),
  })
}

async function occurrencesFromResponse(response: Response): Promise<CountUpOccurrence[]> {
  if (!response.ok) throw new Error(`count_up_request_failed:${response.status}`)
  const body = (await response.json()) as { occurrences?: unknown[]; events?: unknown[] }
  return (body.occurrences ?? body.events ?? [])
    .map(occurrenceFromWire)
    .filter((occurrence): occurrence is CountUpOccurrence => occurrence !== null)
}

export async function fetchCountUpOccurrences(): Promise<CountUpOccurrence[]> {
  return occurrencesFromResponse(await fetch("/api/timer-attention", { credentials: "same-origin" }))
}

export async function postCountUpAction(body: CountUpActionBody): Promise<CountUpOccurrence[]> {
  return occurrencesFromResponse(
    await fetch("/api/timer-attention", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

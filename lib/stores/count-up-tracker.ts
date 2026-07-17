import {
  DEFAULT_COUNT_UP_POLICY,
  normalizeCountUpPolicy,
  policyForTimer,
  type CountUpPolicy,
} from "@/lib/count-up-policy"
import type { CountUpObservation, CountUpOccurrence } from "@/lib/stores/count-up-store"
import { getCountUpOccurrenceKey } from "@/lib/stores/count-up-store"
import type { Timer } from "@/lib/types"

export const COUNT_UP_DISCOVERY_WINDOW_MS = 48 * 60 * 60 * 1_000

export type ZeroCrossEvent = {
  timerId: string
  targetAtMs: number
  crossedAt: number
  projectId?: string
  projectName?: string
  timer: {
    label: string
    pinned: boolean
  }
  policy: CountUpPolicy
  usesDefaultPolicy: boolean
}

export type CountUpTrackerInput = {
  timers: Timer[]
  occurrences: CountUpOccurrence[]
  observations: CountUpObservation[]
  nowMs: number
  suppressedKeys?: ReadonlySet<string>
  policy?: CountUpPolicy
  projectId?: string
  projectName?: string
}

export type CountUpTrackerResult = {
  occurrences: CountUpOccurrence[]
  observations: CountUpObservation[]
  created: CountUpOccurrence[]
  closedKeys: string[]
  autoAcknowledgedKeys: string[]
}

export function getCountUpExpiresAt(occurrence: CountUpOccurrence): number | null {
  if (occurrence.acknowledgedAt !== null || occurrence.firstSeenAt === null) return null
  if (occurrence.deferredUntil !== null) return occurrence.deferredUntil
  return occurrence.reviewExpiresAt
}

function shouldCreateFromHistory(
  timer: Timer,
  targetAtMs: number,
  observation: CountUpObservation | undefined,
  nowMs: number,
) {
  if (observation) return observation.targetAtMs === targetAtMs && observation.observedAt <= targetAtMs

  const createdAtMs = Date.parse(timer.createdAt)
  return Number.isFinite(createdAtMs) && createdAtMs <= targetAtMs && targetAtMs >= nowMs - COUNT_UP_DISCOVERY_WINDOW_MS
}

function detectZeroCross(
  timer: Timer,
  targetAtMs: number,
  policy: CountUpPolicy,
  usesDefaultPolicy: boolean,
  project?: { id?: string; name?: string },
): ZeroCrossEvent {
  return {
    timerId: timer.id,
    targetAtMs,
    crossedAt: targetAtMs,
    ...(project?.id ? { projectId: project.id } : {}),
    ...(project?.name ? { projectName: project.name } : {}),
    timer: { label: timer.label, pinned: timer.pinned === true },
    policy,
    usesDefaultPolicy,
  }
}

function persistZeroCross(event: ZeroCrossEvent): CountUpOccurrence {
  return {
    key: getCountUpOccurrenceKey(event.timerId, event.targetAtMs),
    ...(event.projectId ? { projectId: event.projectId } : {}),
    ...(event.projectName ? { projectName: event.projectName } : {}),
    timer: event.timer,
    timerId: event.timerId,
    targetAtMs: event.targetAtMs,
    crossedAt: event.crossedAt,
    firstSeenAt: null,
    reviewExpiresAt: null,
    acknowledgedAt: null,
    deferredUntil: null,
    policy: event.policy,
    usesDefaultPolicy: event.usesDefaultPolicy,
  }
}

export class CountUpTracker {
  reconcile(args: CountUpTrackerInput): CountUpTrackerResult {
    const timersById = new Map(args.timers.map((timer) => [timer.id, timer]))
    const observationByTimer = new Map(args.observations.map((observation) => [observation.timerId, observation]))
    const occurrences: CountUpOccurrence[] = []
    const closedKeys: string[] = []

    for (const occurrence of args.occurrences) {
      const timer = timersById.get(occurrence.timerId)
      const currentTargetAtMs = timer ? Date.parse(timer.targetDate) : Number.NaN
      const remainsValid =
        timer !== undefined &&
        !timer.archivedAt &&
        timer.recurrence?.enabled !== true &&
        Number.isFinite(currentTargetAtMs) &&
        currentTargetAtMs === occurrence.targetAtMs &&
        currentTargetAtMs < args.nowMs
      if (remainsValid) {
        occurrences.push({
          ...occurrence,
          timer: { label: timer.label, pinned: timer.pinned === true },
          policy: normalizeCountUpPolicy(occurrence.policy),
        })
      } else {
        closedKeys.push(occurrence.key)
      }
    }

    const existingKeys = new Set(occurrences.map((occurrence) => occurrence.key))
    const created: CountUpOccurrence[] = []
    const autoAcknowledgedKeys: string[] = []
    const observations: CountUpObservation[] = []

    for (const timer of args.timers) {
      if (timer.recurrence?.enabled === true) continue
      const targetAtMs = Date.parse(timer.targetDate)
      if (!Number.isFinite(targetAtMs)) continue
      observations.push({ timerId: timer.id, targetAtMs, observedAt: args.nowMs })
      if (timer.archivedAt) continue

      const key = getCountUpOccurrenceKey(timer.id, targetAtMs)
      const usesDefaultPolicy = !timer.afterZero || timer.afterZero.mode === "use-default"
      const policy = policyForTimer(timer.afterZero, args.policy ?? DEFAULT_COUNT_UP_POLICY)
      if (
        targetAtMs < args.nowMs &&
        !existingKeys.has(key) &&
        !args.suppressedKeys?.has(key) &&
        policy.mode !== "move-directly-to-past" &&
        shouldCreateFromHistory(timer, targetAtMs, observationByTimer.get(timer.id), args.nowMs)
      ) {
        const occurrence = persistZeroCross(
          detectZeroCross(timer, targetAtMs, policy, usesDefaultPolicy, {
            id: args.projectId,
            name: args.projectName,
          }),
        )
        occurrences.push(occurrence)
        created.push(occurrence)
        existingKeys.add(key)
      }
    }

    for (const occurrence of occurrences) {
      const expiresAt = getCountUpExpiresAt(occurrence)
      if (occurrence.acknowledgedAt === null && expiresAt !== null && expiresAt <= args.nowMs) {
        occurrence.acknowledgedAt = args.nowMs
        autoAcknowledgedKeys.push(occurrence.key)
      }
    }

    return { occurrences, observations, created, closedKeys, autoAcknowledgedKeys }
  }
}

export const countUpTracker = new CountUpTracker()

export function reconcileCountUpOccurrences(args: CountUpTrackerInput) {
  return countUpTracker.reconcile(args)
}

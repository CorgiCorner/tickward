import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  countUpOccurrencesForProject,
  fetchCountUpOccurrences,
  getCountUpOccurrenceKey,
  mergeCountUpOccurrences,
  readCountUpState,
  countUpStorageKey,
  countUpStorageProjectIds,
  activeCountUpCountsByProject,
  writeCountUpState,
  type CountUpObservation,
  type CountUpOccurrence,
} from "@/lib/stores/count-up-store"
import {
  COUNT_UP_DISCOVERY_WINDOW_MS,
  getCountUpExpiresAt,
  reconcileCountUpOccurrences,
} from "@/lib/stores/count-up-tracker"
import type { Timer } from "@/lib/types"
import { DEFAULT_COUNT_UP_POLICY } from "@/lib/count-up-policy"

const HOUR_MS = 60 * 60 * 1_000
const NOW_MS = Date.parse("2026-07-16T12:00:00.000Z")

function makeTimer(overrides: Partial<Timer> = {}): Timer {
  return {
    id: "timer-1",
    label: "Launch",
    targetDate: new Date(NOW_MS - HOUR_MS).toISOString(),
    timezone: "Europe/Warsaw",
    createdAt: new Date(NOW_MS - 3 * HOUR_MS).toISOString(),
    updatedAt: new Date(NOW_MS - 2 * HOUR_MS).toISOString(),
    ...overrides,
  }
}

function makeOccurrence(overrides: Partial<CountUpOccurrence> = {}): CountUpOccurrence {
  const timerId = overrides.timerId ?? "timer-1"
  const targetAtMs = overrides.targetAtMs ?? NOW_MS - HOUR_MS
  return {
    key: getCountUpOccurrenceKey(timerId, targetAtMs),
    timer: { label: "Launch", pinned: false },
    timerId,
    targetAtMs,
    crossedAt: targetAtMs,
    firstSeenAt: null,
    reviewExpiresAt: null,
    acknowledgedAt: null,
    deferredUntil: null,
    policy: DEFAULT_COUNT_UP_POLICY,
    usesDefaultPolicy: true,
    ...overrides,
  }
}

function reconcile(
  args: {
    timers?: Timer[]
    occurrences?: CountUpOccurrence[]
    observations?: CountUpObservation[]
    nowMs?: number
    suppressedKeys?: ReadonlySet<string>
  } = {},
) {
  return reconcileCountUpOccurrences({
    timers: args.timers ?? [makeTimer()],
    occurrences: args.occurrences ?? [],
    observations: args.observations ?? [],
    nowMs: args.nowMs ?? NOW_MS,
    suppressedKeys: args.suppressedKeys,
  })
}

describe("count-up reconciliation", () => {
  it("creates an unseen occurrence when a timer crossed while the app was closed", () => {
    const targetAtMs = NOW_MS - HOUR_MS

    const result = reconcile()

    expect(result.created).toEqual([
      {
        key: getCountUpOccurrenceKey("timer-1", targetAtMs),
        timer: { label: "Launch", pinned: false },
        timerId: "timer-1",
        targetAtMs,
        crossedAt: targetAtMs,
        firstSeenAt: null,
        reviewExpiresAt: null,
        acknowledgedAt: null,
        deferredUntil: null,
        policy: DEFAULT_COUNT_UP_POLICY,
        usesDefaultPolicy: true,
      },
    ])
    expect(result.occurrences).toEqual(result.created)
  })

  it("bounds unobserved offline discovery to 48 hours", () => {
    const outsideWindowTarget = NOW_MS - COUNT_UP_DISCOVERY_WINDOW_MS - 1
    const timer = makeTimer({
      targetDate: new Date(outsideWindowTarget).toISOString(),
      createdAt: new Date(outsideWindowTarget - HOUR_MS).toISOString(),
    })

    expect(reconcile({ timers: [timer] }).created).toEqual([])
  })

  it("keeps exact observed crossings even when discovery happens after 48 hours", () => {
    const targetAtMs = NOW_MS - COUNT_UP_DISCOVERY_WINDOW_MS - 24 * HOUR_MS
    const timer = makeTimer({
      targetDate: new Date(targetAtMs).toISOString(),
      createdAt: new Date(targetAtMs - HOUR_MS).toISOString(),
    })
    const observation = { timerId: timer.id, targetAtMs, observedAt: targetAtMs - HOUR_MS }

    expect(reconcile({ timers: [timer], observations: [observation] }).created).toHaveLength(1)
  })

  it("reconciles an offline crossing after an unrelated post-zero edit", () => {
    const timer = makeTimer({ updatedAt: new Date(NOW_MS - 1_000).toISOString(), label: "Renamed offline" })

    expect(reconcile({ timers: [timer] }).created).toHaveLength(1)
  })

  it("keeps unseen occurrences indefinitely instead of expiring from crossedAt", () => {
    const occurrence = makeOccurrence()

    const result = reconcile({ occurrences: [occurrence], nowMs: NOW_MS + 365 * 24 * HOUR_MS })

    expect(result.occurrences).toEqual([occurrence])
    expect(result.closedKeys).toEqual([])
    expect(getCountUpExpiresAt(occurrence)).toBeNull()
  })

  it("reads the persisted absolute expiry", () => {
    const unseen = makeOccurrence()
    const seenAt = NOW_MS + 12_345
    const seen = makeOccurrence({ firstSeenAt: seenAt, reviewExpiresAt: seenAt + 15 * 60_000 })

    expect(getCountUpExpiresAt(unseen)).toBeNull()
    expect(getCountUpExpiresAt(seen)).toBe(seenAt + 15 * 60_000)
  })

  it("never expires unseen state even when stale data contains deferredUntil", () => {
    const unseen = makeOccurrence({ deferredUntil: NOW_MS - 1 })

    expect(getCountUpExpiresAt(unseen)).toBeNull()
    const result = reconcile({ occurrences: [unseen] })
    expect(result.occurrences[0]?.acknowledgedAt).toBeNull()
  })

  it("snapshots the active policy when an occurrence is created", () => {
    const result = reconcileCountUpOccurrences({
      timers: [makeTimer()],
      occurrences: [],
      observations: [],
      nowMs: NOW_MS,
      policy: { mode: "after-seen-15m", minutes: null },
    })

    expect(result.created[0]?.policy).toEqual({ mode: "after-seen-15m", minutes: null })
    const later = reconcileCountUpOccurrences({
      timers: [makeTimer()],
      occurrences: result.occurrences,
      observations: result.observations,
      nowMs: NOW_MS + 1_000,
      policy: { mode: "after-seen-1d", minutes: null },
    })
    expect(later.occurrences[0]?.policy).toEqual({ mode: "after-seen-15m", minutes: null })
  })

  it("short-circuits creation for direct-to-Past policy", () => {
    const result = reconcileCountUpOccurrences({
      timers: [makeTimer()],
      occurrences: [],
      observations: [],
      nowMs: NOW_MS,
      policy: { mode: "move-directly-to-past", minutes: null },
    })

    expect(result.created).toEqual([])
    expect(result.occurrences).toEqual([])
  })

  it("uses a timer override instead of the global policy", () => {
    const direct = reconcile({ timers: [makeTimer({ afterZero: { mode: "move-directly-to-past" } })] })
    const custom = reconcileCountUpOccurrences({
      timers: [makeTimer({ afterZero: { mode: "keep-visible", minutes: 45 } })],
      occurrences: [],
      observations: [],
      nowMs: NOW_MS,
      policy: { mode: "move-directly-to-past", minutes: null },
    })

    expect(direct.created).toEqual([])
    expect(custom.created[0]?.policy).toEqual({ mode: "custom", minutes: 45 })
    expect(custom.created[0]?.usesDefaultPolicy).toBe(false)
  })

  it("auto-acknowledges only seen occurrences after their snapshotted duration", () => {
    const unseen = makeOccurrence({ policy: { mode: "after-seen-5m", minutes: null } })
    const seen = makeOccurrence({
      firstSeenAt: NOW_MS - 6 * 60_000,
      reviewExpiresAt: NOW_MS - 60_000,
      policy: { mode: "after-seen-5m", minutes: null },
    })

    expect(reconcile({ occurrences: [unseen] }).occurrences[0]?.acknowledgedAt).toBeNull()
    const result = reconcile({ occurrences: [seen] })
    expect(result.occurrences[0]?.acknowledgedAt).toBe(NOW_MS)
    expect(result.autoAcknowledgedKeys).toEqual([seen.key])
  })

  it("lets an absolute per-occurrence deferral override the global snapshot", () => {
    const occurrence = makeOccurrence({
      firstSeenAt: NOW_MS - HOUR_MS,
      deferredUntil: NOW_MS + HOUR_MS,
      policy: { mode: "after-seen-5m", minutes: null },
    })

    const before = reconcile({ occurrences: [occurrence] })
    const after = reconcile({
      occurrences: before.occurrences,
      observations: before.observations,
      nowMs: NOW_MS + HOUR_MS + 1,
    })

    expect(before.occurrences[0]?.acknowledgedAt).toBeNull()
    expect(after.occurrences[0]?.acknowledgedAt).toBe(NOW_MS + HOUR_MS + 1)
  })

  it("closes an occurrence when its timer date moves back to the future", () => {
    const occurrence = makeOccurrence()
    const futureTimer = makeTimer({ targetDate: new Date(NOW_MS + HOUR_MS).toISOString() })

    const result = reconcile({ timers: [futureTimer], occurrences: [occurrence] })

    expect(result.occurrences).toEqual([])
    expect(result.created).toEqual([])
    expect(result.closedKeys).toEqual([occurrence.key])
  })

  it("closes an occurrence when its timer is archived", () => {
    const occurrence = makeOccurrence()
    const archivedTimer = makeTimer({ archivedAt: new Date(NOW_MS).toISOString() })

    const result = reconcile({ timers: [archivedTimer], occurrences: [occurrence] })

    expect(result.occurrences).toEqual([])
    expect(result.closedKeys).toEqual([occurrence.key])
    expect(result.observations).toEqual([
      { timerId: occurrence.timerId, targetAtMs: occurrence.targetAtMs, observedAt: NOW_MS },
    ])
  })

  it("does not recreate a closed occurrence after an archived timer is restored", () => {
    const occurrence = makeOccurrence()
    const archived = reconcile({
      timers: [makeTimer({ archivedAt: new Date(NOW_MS).toISOString() })],
      occurrences: [occurrence],
    })
    const restored = reconcile({ observations: archived.observations })

    expect(restored.created).toEqual([])
  })

  it("does not create an occurrence for a timer that was created with a past date", () => {
    const timer = makeTimer({
      targetDate: new Date(NOW_MS - HOUR_MS).toISOString(),
      createdAt: new Date(NOW_MS).toISOString(),
      updatedAt: new Date(NOW_MS).toISOString(),
    })

    expect(reconcile({ timers: [timer] }).created).toEqual([])
  })

  it("does not create an occurrence after a user edit moves a future timer into the past", () => {
    const previousTargetAtMs = NOW_MS + HOUR_MS
    const observation: CountUpObservation = {
      timerId: "timer-1",
      targetAtMs: previousTargetAtMs,
      observedAt: NOW_MS - 1_000,
    }
    const editedTimer = makeTimer({
      targetDate: new Date(NOW_MS - 1_000).toISOString(),
      updatedAt: new Date(NOW_MS).toISOString(),
    })

    expect(reconcile({ timers: [editedTimer], observations: [observation] }).created).toEqual([])
  })

  it("honors explicit suppression even when history would otherwise create an occurrence", () => {
    const timer = makeTimer()
    const key = getCountUpOccurrenceKey(timer.id, Date.parse(timer.targetDate))

    const result = reconcile({ timers: [timer], suppressedKeys: new Set([key]) })

    expect(result.created).toEqual([])
    expect(result.occurrences).toEqual([])
  })

  it("excludes recurring timers without leaving occurrences behind", () => {
    const occurrence = makeOccurrence()
    const recurringTimer = makeTimer({ recurrence: { enabled: true, type: "daily" } })

    const result = reconcile({ timers: [recurringTimer], occurrences: [occurrence] })

    expect(result.created).toEqual([])
    expect(result.occurrences).toEqual([])
    expect(result.closedKeys).toEqual([occurrence.key])
  })

  it("deduplicates repeated reconciliation by timer and target occurrence", () => {
    const first = reconcile()
    const second = reconcile({ occurrences: first.occurrences, observations: first.observations })

    expect(second.created).toEqual([])
    expect(second.occurrences).toHaveLength(1)
    expect(second.occurrences[0]?.key).toBe(getCountUpOccurrenceKey("timer-1", NOW_MS - HOUR_MS))
  })

  it("derives crossedAt from the absolute target timestamp", () => {
    const targetDate = "2026-10-25T02:30:00.000+02:00"
    const targetAtMs = Date.parse(targetDate)
    const timer = makeTimer({
      targetDate,
      createdAt: new Date(targetAtMs - HOUR_MS).toISOString(),
      updatedAt: new Date(targetAtMs - HOUR_MS).toISOString(),
    })

    const result = reconcile({ timers: [timer], nowMs: targetAtMs + 1 })

    expect(result.created[0]).toMatchObject({ targetAtMs, crossedAt: targetAtMs })
  })
})

describe("count-up persistence and account merge", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("persists anonymous count-up state across reloads", () => {
    const occurrence = makeOccurrence({
      firstSeenAt: NOW_MS,
      reviewExpiresAt: NOW_MS + 15 * 60_000,
      policy: { mode: "after-seen-15m", minutes: null },
    })
    const observation = { timerId: occurrence.timerId, targetAtMs: occurrence.targetAtMs, observedAt: NOW_MS }

    writeCountUpState("project-1", { occurrences: [occurrence], observations: [observation] })

    expect(readCountUpState("project-1")).toEqual({
      occurrences: [{ ...occurrence, projectId: "project-1" }],
      observations: [observation],
    })
    expect(localStorage.getItem(countUpStorageKey("project-1"))).not.toBeNull()
  })

  it("faithfully normalizes legacy seen, unseen, and deferred records", () => {
    const legacyRecord = (occurrence: CountUpOccurrence) => {
      const record: Partial<CountUpOccurrence> = { ...occurrence }
      delete record.reviewExpiresAt
      delete record.usesDefaultPolicy
      return record
    }
    localStorage.setItem(
      countUpStorageKey("project-1"),
      JSON.stringify({
        occurrences: [
          makeOccurrence({ firstSeenAt: NOW_MS, policy: { mode: "after-seen-15m", minutes: null } }),
          makeOccurrence({ timerId: "timer-unseen", key: `timer-unseen|${NOW_MS - HOUR_MS}` }),
          makeOccurrence({
            timerId: "timer-deferred",
            key: `timer-deferred|${NOW_MS - HOUR_MS}`,
            firstSeenAt: NOW_MS,
            deferredUntil: NOW_MS + HOUR_MS,
            policy: { mode: "after-seen-5m", minutes: null },
          }),
        ].map(legacyRecord),
      }),
    )

    const [seen, unseen, deferred] = readCountUpState("project-1").occurrences

    expect(seen?.reviewExpiresAt).toBe(NOW_MS + 15 * 60_000)
    expect(unseen?.reviewExpiresAt).toBeNull()
    expect(deferred?.reviewExpiresAt).toBe(NOW_MS + HOUR_MS)
    expect(seen?.usesDefaultPolicy).toBe(true)
  })

  it("preserves the existing browser-storage and API wire contracts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    expect(countUpStorageKey("project-1")).toBe("td_timer_attention_v1:project-1")
    await expect(fetchCountUpOccurrences()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledWith("/api/timer-attention", { credentials: "same-origin" })

    vi.unstubAllGlobals()
  })

  it("merges anonymous and signed-in occurrences by occurrence without losing progress", () => {
    const local = makeOccurrence({ firstSeenAt: NOW_MS, deferredUntil: NOW_MS + HOUR_MS })
    const remote = makeOccurrence({
      firstSeenAt: NOW_MS + 1_000,
      acknowledgedAt: NOW_MS + 2_000,
      deferredUntil: NOW_MS + 2 * HOUR_MS,
    })

    const result = mergeCountUpOccurrences([local], [remote])

    expect(result).toEqual([
      {
        ...local,
        firstSeenAt: NOW_MS,
        acknowledgedAt: NOW_MS + 2_000,
        deferredUntil: NOW_MS + 2 * HOUR_MS,
      },
    ])
  })

  it("preserves distinct target occurrences for the same timer during merge", () => {
    const first = makeOccurrence()
    const secondTargetAtMs = NOW_MS + HOUR_MS
    const second = makeOccurrence({
      targetAtMs: secondTargetAtMs,
      key: getCountUpOccurrenceKey("timer-1", secondTargetAtMs),
      crossedAt: secondTargetAtMs,
    })

    expect(mergeCountUpOccurrences([first], [first, second])).toEqual([first, second])
  })

  it("keeps duplicate occurrence keys isolated by project and exposes global selectors", () => {
    const first = makeOccurrence({ projectId: "project-a", projectName: "Alpha" })
    const second = makeOccurrence({ projectId: "project-b", projectName: "Beta" })
    const occurrences = mergeCountUpOccurrences([first], [second])

    expect(occurrences).toHaveLength(2)
    expect(countUpOccurrencesForProject(occurrences, "project-a")).toEqual([first])
    expect(activeCountUpCountsByProject(occurrences)).toEqual(
      new Map([
        ["project-a", 1],
        ["project-b", 1],
      ]),
    )
    expect(first.key).toBe(second.key)
    expect(first.key).toBe(getCountUpOccurrenceKey(first.timerId, first.targetAtMs))
  })

  it("enumerates count-up storage groups without exposing unrelated keys", () => {
    localStorage.setItem(countUpStorageKey("project-a"), "{}")
    localStorage.setItem(countUpStorageKey("project-b"), "{}")
    localStorage.setItem("other:key", "{}")

    expect(countUpStorageProjectIds().sort()).toEqual(["project-a", "project-b"])
  })
})

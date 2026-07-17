import { describe, expect, it } from "vitest"

import { DEFAULT_COUNT_UP_POLICY } from "@/lib/count-up-policy"
import { getCountUpOccurrenceKey } from "@/lib/stores/count-up-store"
import { CountUpTracker, getCountUpExpiresAt } from "@/lib/stores/count-up-tracker"
import type { Timer } from "@/lib/types"

const NOW_MS = Date.parse("2026-07-16T12:00:00.000Z")
const TARGET_AT_MS = NOW_MS - 60_000

function timer(overrides: Partial<Timer> = {}): Timer {
  return {
    id: "timer-1",
    label: "Launch",
    targetDate: new Date(TARGET_AT_MS).toISOString(),
    timezone: "Europe/Warsaw",
    createdAt: new Date(TARGET_AT_MS - 60_000).toISOString(),
    updatedAt: new Date(TARGET_AT_MS - 60_000).toISOString(),
    ...overrides,
  }
}

describe("CountUpTracker", () => {
  it("turns a detected zero crossing into one persisted occurrence", () => {
    const result = new CountUpTracker().reconcile({
      timers: [timer()],
      occurrences: [],
      observations: [],
      nowMs: NOW_MS,
      policy: DEFAULT_COUNT_UP_POLICY,
      projectId: "project-1",
      projectName: "Marketing",
    })

    expect(result.created).toEqual([
      expect.objectContaining({
        key: getCountUpOccurrenceKey("timer-1", TARGET_AT_MS),
        projectId: "project-1",
        projectName: "Marketing",
        timerId: "timer-1",
        targetAtMs: TARGET_AT_MS,
        crossedAt: TARGET_AT_MS,
        firstSeenAt: null,
        reviewExpiresAt: null,
        acknowledgedAt: null,
        deferredUntil: null,
        usesDefaultPolicy: true,
      }),
    ])
    expect(result.occurrences).toEqual(result.created)
  })

  it("starts expiry at firstSeenAt, never crossedAt", () => {
    const occurrence = {
      key: getCountUpOccurrenceKey("timer-1", TARGET_AT_MS),
      timerId: "timer-1",
      targetAtMs: TARGET_AT_MS,
      crossedAt: TARGET_AT_MS,
      firstSeenAt: null,
      reviewExpiresAt: null,
      acknowledgedAt: null,
      deferredUntil: null,
      policy: { mode: "after-seen-5m", minutes: null } as const,
      usesDefaultPolicy: true,
    }

    expect(getCountUpExpiresAt(occurrence)).toBeNull()
    expect(getCountUpExpiresAt({ ...occurrence, firstSeenAt: NOW_MS, reviewExpiresAt: NOW_MS + 5 * 60_000 })).toBe(
      NOW_MS + 5 * 60_000,
    )
  })
})

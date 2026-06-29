import { describe, expect, it } from "vitest"

import { makeTimer } from "@/test/factories"
import type { TimerFilters } from "@/lib/types"

import {
  activeTimerFilterCount,
  timerFilterType,
  timerHasNotifications,
  timerIsMuted,
  timerIsRecurring,
  timerIsShared,
  timerMatchesFilters,
  timerToggleFilterCount,
  timerTypeFilterCount,
} from "./timer-filters"

const NOW_MS = Date.parse("2026-05-24T00:00:00.000Z")

function filters(overrides: Partial<TimerFilters> = {}): TimerFilters {
  return {
    type: "all",
    pinned: false,
    muted: false,
    shared: false,
    recurring: false,
    ...overrides,
  }
}

describe("timer filters", () => {
  it("detects notification and muted timers", () => {
    expect(timerHasNotifications(makeTimer())).toBe(true)
    expect(timerHasNotifications(makeTimer({ notify: true }))).toBe(true)
    expect(timerHasNotifications(makeTimer({ notification: { enabled: true } }))).toBe(true)
    expect(timerIsMuted(makeTimer())).toBe(false)
    expect(timerIsMuted(makeTimer({ notify: false }))).toBe(true)
    expect(timerMatchesFilters(makeTimer({ notify: true }), filters({ muted: true }), NOW_MS)).toBe(false)
  })

  it("matches shared and followed timers", () => {
    expect(timerIsShared(makeTimer({ sharedAt: "2026-06-06T12:00:00.000Z" }))).toBe(true)
    expect(timerIsShared(makeTimer({ sourceShareId: "timer_share" }))).toBe(true)
    expect(timerMatchesFilters(makeTimer(), filters({ shared: true }), NOW_MS)).toBe(false)
  })

  it("matches type, pinned, and recurring filters", () => {
    expect(timerFilterType(makeTimer({ targetDate: "2026-05-25T12:00:00.000Z" }), NOW_MS)).toBe("countdown")
    expect(timerFilterType(makeTimer({ targetDate: "2026-05-20T12:00:00.000Z" }), NOW_MS)).toBe("countUp")
    expect(timerIsRecurring(makeTimer({ recurrence: { enabled: true, type: "daily" } }))).toBe(true)
    expect(timerMatchesFilters(makeTimer({ pinned: true }), filters({ pinned: true }), NOW_MS)).toBe(true)
    expect(
      timerMatchesFilters(makeTimer({ targetDate: "2026-05-25T12:00:00.000Z" }), filters({ type: "countUp" }), NOW_MS),
    ).toBe(false)
    expect(
      timerMatchesFilters(
        makeTimer({ targetDate: "2026-05-20T12:00:00.000Z", recurrence: { enabled: true, type: "daily" } }),
        filters({ type: "countdown", recurring: true }),
        NOW_MS,
      ),
    ).toBe(true)
  })

  it("counts type and toggle options", () => {
    const timers = [
      makeTimer({ id: "countdown", notify: true, targetDate: "2026-05-25T12:00:00.000Z" }),
      makeTimer({ id: "count-up", notify: true, targetDate: "2026-05-20T12:00:00.000Z" }),
      makeTimer({ id: "muted", notify: false, targetDate: "2026-05-26T12:00:00.000Z" }),
      makeTimer({
        id: "recurring",
        notify: true,
        targetDate: "2026-05-20T12:00:00.000Z",
        recurrence: { enabled: true, type: "daily" },
      }),
    ]

    expect(timerTypeFilterCount(timers, "all", NOW_MS)).toBe(4)
    expect(timerTypeFilterCount(timers, "countUp", NOW_MS)).toBe(1)
    expect(timerToggleFilterCount(timers, "muted", "all", NOW_MS)).toBe(1)
    expect(timerToggleFilterCount(timers, "recurring", "countdown", NOW_MS)).toBe(1)
  })

  it("counts active filters", () => {
    expect(activeTimerFilterCount(filters())).toBe(0)
    expect(activeTimerFilterCount(filters({ type: "countUp" }))).toBe(1)
    expect(activeTimerFilterCount(filters({ type: "countUp", pinned: true, shared: true }))).toBe(3)
  })
})

import { describe, expect, it } from "vitest"

import { makeTimer } from "@/test/factories"

import { activeTimerFilterCount, timerHasNotifications, timerIsShared, timerMatchesFilters } from "./timer-filters"

describe("timer filters", () => {
  it("matches notification-enabled timers", () => {
    expect(timerHasNotifications(makeTimer({ notify: true }))).toBe(true)
    expect(timerHasNotifications(makeTimer({ notification: { enabled: true } }))).toBe(true)
    expect(timerMatchesFilters(makeTimer({ notify: false }), { notifications: true, shared: false })).toBe(false)
  })

  it("matches shared and followed timers", () => {
    expect(timerIsShared(makeTimer({ sharedAt: "2026-06-06T12:00:00.000Z" }))).toBe(true)
    expect(timerIsShared(makeTimer({ sourceShareId: "timer_share" }))).toBe(true)
    expect(timerMatchesFilters(makeTimer(), { notifications: false, shared: true })).toBe(false)
  })

  it("counts active filters", () => {
    expect(activeTimerFilterCount({ notifications: false, shared: false })).toBe(0)
    expect(activeTimerFilterCount({ notifications: true, shared: false })).toBe(1)
    expect(activeTimerFilterCount({ notifications: true, shared: true })).toBe(2)
  })
})

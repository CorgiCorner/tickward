import { describe, expect, it } from "vitest"

import type { Timer } from "@/lib/types"

import {
  formatDialCaption,
  formatDialDateLine,
  formatDialDuration,
  formatDialLegend,
  formatDialReminder,
  formatDialUnit,
  formatDialWhen,
  formatMilestoneLabel,
} from "./dial-format"
import { dialTimerView } from "./dial-model"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ZONE = "Europe/Warsaw"
// Tue, Nov 10, 2026, 13:00 in Warsaw.
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0)

function timer(overrides: Partial<Timer> & Pick<Timer, "id">): Timer {
  return {
    label: overrides.id,
    targetDate: new Date(NOW + DAY).toISOString(),
    timezone: ZONE,
    createdAt: new Date(NOW - 30 * DAY).toISOString(),
    ...overrides,
  }
}

describe("dial words", () => {
  it("names the readout unit with plurals", () => {
    expect(formatDialUnit({ unit: "days", value: 1 })).toBe("day")
    expect(formatDialUnit({ unit: "days", value: 1300 })).toBe("days")
    expect(formatDialUnit({ unit: "hours", value: 1 })).toBe("hour")
    expect(formatDialUnit({ unit: "hours", value: 9 })).toBe("hours")
  })

  it("rounds a duration in the largest unit that fits", () => {
    expect(formatDialDuration(161 * DAY + 5 * HOUR)).toBe("161 days")
    expect(formatDialDuration(9 * HOUR + 20 * 60_000)).toBe("9 hours")
    expect(formatDialDuration(99 * DAY + 23 * HOUR)).toBe("100 days")
    expect(formatDialDuration(60_000)).toBe("1 minute")
    expect(formatDialDuration(200)).toBe("1 second")
  })

  it("labels milestones with grouped numbers", () => {
    expect(formatMilestoneLabel({ unit: "days", count: 1300 })).toBe("1,300 days")
    expect(formatMilestoneLabel({ unit: "years", count: 1 })).toBe("1 year")
  })

  it("says today, tomorrow, a weekday or a date in the timer's zone", () => {
    expect(formatDialWhen(NOW + 3 * HOUR, ZONE, NOW)).toBe("today at 16:00")
    expect(formatDialWhen(NOW + DAY, ZONE, NOW)).toBe("tomorrow at 13:00")
    expect(formatDialWhen(NOW + 5 * DAY, ZONE, NOW)).toBe("Sun at 13:00")
    expect(formatDialWhen(NOW + 10 * DAY, ZONE, NOW)).toBe("Nov 20 at 13:00")
  })
})

describe("dial lines", () => {
  it("describes a one-off countdown", () => {
    const train = timer({
      id: "train",
      targetDate: new Date(Date.UTC(2026, 10, 11, 15, 0)).toISOString(),
      reminders: [{ offsetMinutes: 1440 }, { offsetMinutes: 10080 }],
    })
    const view = dialTimerView(train, NOW)
    expect(formatDialCaption(train, view, NOW)).toBe("Wed, Nov 11 at 16:00")
    expect(formatDialDateLine(train, view, NOW)).toBe("Wed, Nov 11 · 16:00 · Europe/Warsaw")
    expect(formatDialLegend(view, NOW)).toBe("One tick per hour")
    expect(formatDialReminder(train, view, NOW)).toBe("Reminder today at 16:00, 1 day before")
  })

  it("leaves the reminder out when notifications are off or none is ahead", () => {
    const muted = timer({ id: "muted", notify: false, reminders: [{ offsetMinutes: 60 }] })
    expect(formatDialReminder(muted, dialTimerView(muted, NOW), NOW)).toBeNull()
    const passed = timer({ id: "passed", reminders: [{ offsetMinutes: 2880 }] })
    expect(formatDialReminder(passed, dialTimerView(passed, NOW), NOW)).toBeNull()
  })

  it("describes a repeating countdown", () => {
    const herbs = timer({
      id: "herbs",
      targetDate: new Date(Date.UTC(2026, 9, 1, 7, 45)).toISOString(),
      recurrence: { type: "daily", enabled: true },
    })
    const view = dialTimerView(herbs, NOW)
    expect(formatDialCaption(herbs, view, NOW)).toBe("Every day, next Wed 09:45")
    expect(formatDialDateLine(herbs, view, NOW)).toBe("Every day · Wed, Nov 11 · 09:45 · Europe/Warsaw")
  })

  it("describes a count-up on its way to a milestone and on its milestone day", () => {
    const parcel = timer({
      id: "parcel",
      mode: "since",
      targetDate: new Date(NOW - 15 * HOUR).toISOString(),
      milestones: { rules: [{ unit: "days", at: [1, 3, 7] }] },
    })
    const view = dialTimerView(parcel, NOW)
    expect(formatDialCaption(parcel, view, NOW)).toBe("1 day in 9 hours")
    expect(formatDialLegend(view, NOW)).toBe("9 hours to 1 day")

    const met = timer({ id: "met", mode: "since", targetDate: new Date(NOW - 1300 * DAY - 2 * HOUR).toISOString() })
    const metView = dialTimerView(met, NOW)
    expect(formatDialCaption(met, metView, NOW)).toBe("Milestone today")
    expect(formatDialLegend(metView, NOW)).toBe("")
    expect(formatDialDateLine(met, metView, NOW)).toMatch(
      /^Since \w{3}, \w{3} \d+, 2023 · \d{2}:\d{2} · Europe\/Warsaw$/,
    )
  })
})

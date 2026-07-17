import { describe, expect, it } from "vitest"

import {
  effectiveTargetDate,
  formatTargetInTimeZone,
  getCountdownParts,
  nextOccurrenceAfter,
  pad2,
  recurrenceHistory,
  reminderOffsetsAtRisk,
  upcomingOccurrences,
  wallClockToUtcIso,
} from "@/lib/utils"
import { makeTimer } from "@/test/factories"

describe("date and countdown helpers", () => {
  it("splits a future countdown into stable parts", () => {
    const parts = getCountdownParts("2026-05-26T01:02:03.000Z", Date.parse("2026-05-24T00:00:00.000Z"))

    expect(parts).toMatchObject({
      isCountUp: false,
      days: 2,
      hours: 1,
      minutes: 2,
      seconds: 3,
    })
  })

  it("counts up from a past date", () => {
    const parts = getCountdownParts("2026-05-23T23:59:30.000Z", Date.parse("2026-05-24T00:00:00.000Z"))

    expect(parts.isCountUp).toBe(true)
    expect(parts.seconds).toBe(30)
  })

  it("converts wall-clock time in a timezone to UTC", () => {
    expect(wallClockToUtcIso({ date: "2026-05-24", time: "09:30", timezone: "Europe/Warsaw" })).toBe(
      "2026-05-24T07:30:00.000Z",
    )
  })

  it("pads one-digit numbers", () => {
    expect(pad2(0)).toBe("00")
    expect(pad2(9)).toBe("09")
    expect(pad2(12)).toBe("12")
  })
})

describe("formatTargetInTimeZone", () => {
  it("formats the target in the requested zone", () => {
    expect(formatTargetInTimeZone("2026-07-09T16:00:00.000Z", "Europe/Warsaw")).toBe("Jul 9, 2026 · 18:00")
  })

  it("falls back to marked UTC when the runtime cannot resolve the zone", () => {
    // date-fns-tz maps an Intl-rejected zone to an invalid date instead of
    // throwing a zone error; this is the embed "Invalid time value" crash.
    expect(formatTargetInTimeZone("2026-07-09T16:00:00.000Z", "Not/A_Zone")).toBe("Jul 9, 2026 · 16:00 UTC")
  })

  it("returns null instead of throwing for unparseable targets", () => {
    expect(formatTargetInTimeZone("not-a-date", "Europe/Warsaw")).toBeNull()
    // Passes the stored-shape regex but is not a real calendar instant.
    expect(formatTargetInTimeZone("2026-13-45T25:99:99", "Europe/Warsaw")).toBeNull()
  })
})

describe("recurring timer derivation (no mutation)", () => {
  const nowMs = Date.parse("2026-05-24T00:00:00.000Z")

  it("returns the literal target for non-recurring timers", () => {
    const timer = makeTimer({ targetDate: "2026-05-17T00:00:00.000Z" })
    expect(effectiveTargetDate(timer, nowMs)).toBe("2026-05-17T00:00:00.000Z")
  })

  it("derives the next milestone for since timers", () => {
    const timer = makeTimer({
      mode: "since",
      targetDate: "2026-01-01T10:00:00.000Z",
      timezone: "UTC",
      milestones: { rules: [{ unit: "days", every: 100 }] },
    })
    expect(effectiveTargetDate(timer, Date.parse("2026-04-01T10:00:00.000Z"))).toBe("2026-04-11T10:00:00.000Z")
    expect(nextOccurrenceAfter(timer, Date.parse("2026-04-01T10:00:00.000Z"))).toEqual({
      at: "2026-04-11T10:00:00.000Z",
      milestone: { unit: "days", count: 100 },
    })
  })

  it("returns no next occurrence for a plain countdown", () => {
    const timer = makeTimer({ targetDate: "2026-05-25T00:00:00.000Z" })
    expect(nextOccurrenceAfter(timer, nowMs)).toBeNull()
  })

  it("returns the anchor while the first occurrence is still in the future", () => {
    const timer = makeTimer({
      targetDate: "2026-05-25T00:00:00.000Z",
      recurrence: { type: "weekly", enabled: true },
    })
    expect(effectiveTargetDate(timer, nowMs)).toBe("2026-05-25T00:00:00.000Z")
    expect(nextOccurrenceAfter(timer, nowMs)).toEqual({ at: "2026-05-25T00:00:00.000Z" })
  })

  it("derives the next future occurrence and leaves the anchor untouched", () => {
    const timer = makeTimer({
      targetDate: "2026-05-03T00:00:00.000Z",
      recurrence: { type: "weekly", enabled: true },
    })
    expect(effectiveTargetDate(timer, nowMs)).toBe("2026-05-31T00:00:00.000Z")
    expect(timer.targetDate).toBe("2026-05-03T00:00:00.000Z")
  })

  it("degrades to UTC slots instead of throwing when the runtime cannot resolve the zone", () => {
    const timer = makeTimer({
      targetDate: "2026-05-03T00:00:00.000Z",
      timezone: "Not/A_Zone",
      recurrence: { type: "weekly", enabled: true },
    })
    expect(effectiveTargetDate(timer, nowMs)).toBe("2026-05-31T00:00:00.000Z")
    expect(recurrenceHistory(timer, nowMs)).toEqual({ count: 4, last: "2026-05-24T00:00:00.000Z" })
  })

  it("reports no history for non-recurring or not-yet-started timers", () => {
    expect(recurrenceHistory(makeTimer({ targetDate: "2026-05-17T00:00:00.000Z" }), nowMs)).toEqual({
      count: 0,
      last: null,
    })
    expect(
      recurrenceHistory(
        makeTimer({
          targetDate: "2026-05-25T00:00:00.000Z",
          recurrence: { type: "weekly", enabled: true },
        }),
        nowMs,
      ),
    ).toEqual({ count: 0, last: null })
  })

  it("counts elapsed occurrences and the most recent one", () => {
    const timer = makeTimer({
      targetDate: "2026-05-03T00:00:00.000Z",
      recurrence: { type: "weekly", enabled: true },
    })
    expect(recurrenceHistory(timer, nowMs)).toEqual({
      count: 4,
      last: "2026-05-24T00:00:00.000Z",
    })
  })

  it("keeps the wall-clock time across a DST change (weekly)", () => {
    // Mar 22 2026 is a Sunday, 10:00 in Warsaw (CET, +1) = 09:00Z.
    // EU springs forward Mar 29 2026, so Mar 29 10:00 Warsaw (CEST, +2) = 08:00Z.
    const timer = makeTimer({
      timezone: "Europe/Warsaw",
      targetDate: "2026-03-22T09:00:00.000Z",
      recurrence: { type: "weekly", enabled: true },
    })
    expect(effectiveTargetDate(timer, Date.parse("2026-03-23T00:00:00Z"))).toBe("2026-03-29T08:00:00.000Z")
  })

  it("loops daily, anchored to the set date", () => {
    const timer = makeTimer({
      targetDate: "2026-05-22T09:00:00.000Z",
      recurrence: { type: "daily", enabled: true },
    })
    // occurrences at 09:00 each day: May 22, 23 elapsed; next is May 24 09:00
    expect(effectiveTargetDate(timer, nowMs)).toBe("2026-05-24T09:00:00.000Z")
    expect(recurrenceHistory(timer, nowMs)).toEqual({
      count: 2,
      last: "2026-05-23T09:00:00.000Z",
    })
  })

  it("lists upcoming occurrences from the anchor for a schedule preview", () => {
    expect(upcomingOccurrences("2026-01-30T00:00:00.000Z", "daily", "UTC", 3)).toEqual([
      "2026-01-30T00:00:00.000Z",
      "2026-01-31T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
    ])
    expect(upcomingOccurrences("2026-01-30T00:00:00.000Z", "yearly", "UTC", 3)).toEqual([
      "2026-01-30T00:00:00.000Z",
      "2027-01-30T00:00:00.000Z",
      "2028-01-30T00:00:00.000Z",
    ])
  })

  it("skips months without the chosen day (RRULE semantics)", () => {
    // the 31st: February and April/June... are skipped
    expect(upcomingOccurrences("2026-01-31T12:00:00.000Z", "monthly", "UTC", 3)).toEqual([
      "2026-01-31T12:00:00.000Z",
      "2026-03-31T12:00:00.000Z",
      "2026-05-31T12:00:00.000Z",
    ])
  })

  it("supports a last-day-of-month slot", () => {
    expect(upcomingOccurrences("2026-01-31T12:00:00.000Z", "monthly", "UTC", 3, true)).toEqual([
      "2026-01-31T12:00:00.000Z",
      "2026-02-28T12:00:00.000Z",
      "2026-03-31T12:00:00.000Z",
    ])
  })

  it("flags a reminder whose offset matches a daily recurrence gap", () => {
    const timer = makeTimer({
      targetDate: "2026-05-22T09:00:00.000Z",
      timezone: "UTC",
      recurrence: { type: "daily", enabled: true },
      reminders: [{ offsetMinutes: 1440 }, { offsetMinutes: 60 }],
    })

    expect(reminderOffsetsAtRisk(timer, nowMs)).toEqual([1440])
  })

  it("does not flag a one-day reminder for weekly milestones", () => {
    const timer = makeTimer({
      mode: "since",
      targetDate: "2026-01-01T10:00:00.000Z",
      timezone: "UTC",
      milestones: { rules: [{ unit: "weeks", every: 1 }] },
      reminders: [{ offsetMinutes: 1440 }],
    })

    expect(reminderOffsetsAtRisk(timer, nowMs)).toEqual([])
  })

  it("measures merged milestone gaps instead of nominal rule periods", () => {
    const timer = makeTimer({
      mode: "since",
      targetDate: "2026-01-01T10:00:00.000Z",
      timezone: "UTC",
      milestones: {
        rules: [
          { unit: "days", every: 7 },
          { unit: "days", every: 30 },
        ],
      },
      reminders: [{ offsetMinutes: 4320 }],
    })

    expect(reminderOffsetsAtRisk(timer, Date.parse("2026-01-01T10:00:00.000Z"))).toEqual([4320])
  })

  it("does not flag reminders on a non-recurring countdown", () => {
    const timer = makeTimer({ reminders: [{ offsetMinutes: 40320 }] })

    expect(reminderOffsetsAtRisk(timer, nowMs)).toEqual([])
  })
})

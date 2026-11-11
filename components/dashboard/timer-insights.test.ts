import { describe, expect, it } from "vitest"

import {
  calendarElapsed,
  calendarLead,
  counterShowsMilestone,
  countdownSegments,
  elapsedDays,
  formatTimeUntil,
  formatUpcomingMoment,
  milestoneInsight,
  nextReminder,
} from "@/components/dashboard/timer-insights"
import { makeTimer } from "@/test/factories"

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

describe("countdownSegments", () => {
  it("uses days, hrs, min and sec", () => {
    expect(countdownSegments({ days: 1, hours: 4, minutes: 10, seconds: 3 }).map((s) => [s.value, s.label])).toEqual([
      ["1", "day"],
      ["04", "hrs"],
      ["10", "min"],
      ["03", "sec"],
    ])
  })

  it("drops the day segment under a day", () => {
    expect(countdownSegments({ days: 0, hours: 14, minutes: 49, seconds: 56 }).map((s) => s.key)).toEqual([
      "hours",
      "minutes",
      "seconds",
    ])
  })

  it("groups large day counts", () => {
    expect(countdownSegments({ days: 1300, hours: 0, minutes: 0, seconds: 0 })[0]).toMatchObject({
      value: "1,300",
      label: "days",
    })
  })
})

describe("nextReminder", () => {
  const timer = makeTimer({
    targetDate: "2026-11-11T15:00:00.000Z",
    notify: true,
    reminders: [{ offsetMinutes: 10080 }, { offsetMinutes: 1440 }, { offsetMinutes: 60 }],
  })

  it("picks the earliest reminder still ahead", () => {
    expect(nextReminder(timer, timer.targetDate, Date.parse("2026-11-10T09:00:00.000Z"))).toEqual({
      offsetMinutes: 1440,
      atMs: Date.parse("2026-11-10T15:00:00.000Z"),
    })
  })

  it("returns null once every reminder has passed", () => {
    expect(nextReminder(timer, timer.targetDate, Date.parse("2026-11-11T14:30:00.000Z"))).toBeNull()
  })

  it("returns null for count-ups and muted timers", () => {
    expect(nextReminder({ ...timer, mode: "since" }, timer.targetDate, 0)).toBeNull()
    expect(nextReminder({ ...timer, notify: false }, timer.targetDate, 0)).toBeNull()
  })
})

describe("formatUpcomingMoment", () => {
  const now = Date.parse("2026-11-10T09:00:00.000Z")

  it("names today and tomorrow in the timer's zone", () => {
    expect(formatUpcomingMoment(Date.parse("2026-11-10T15:00:00.000Z"), now, "Europe/Warsaw")).toBe("today 16:00")
    expect(formatUpcomingMoment(Date.parse("2026-11-11T08:00:00.000Z"), now, "Europe/Warsaw")).toBe("tomorrow 09:00")
  })

  it("uses a weekday within the week and a date later on", () => {
    expect(formatUpcomingMoment(Date.parse("2026-11-15T17:00:00.000Z"), now, "Europe/Warsaw")).toBe("Sun 18:00")
    expect(formatUpcomingMoment(Date.parse("2026-11-30T17:00:00.000Z"), now, "Europe/Warsaw")).toBe("Nov 30")
  })
})

describe("formatTimeUntil", () => {
  it("reads hours and minutes under a day and days above", () => {
    expect(formatTimeUntil(9 * HOUR + 10 * 60_000, 0)).toBe("in 9 h 10 min")
    expect(formatTimeUntil(25 * 60_000, 0)).toBe("in 25 min")
    expect(formatTimeUntil(83 * DAY + HOUR, 0)).toBe("in 83 days")
  })
})

describe("milestoneInsight", () => {
  const sinceWeMet = makeTimer({
    mode: "since",
    targetDate: "2023-11-10T09:00:00.000Z",
    timezone: "Europe/Warsaw",
    milestones: { rules: [{ unit: "years", every: 1 }] },
  })

  it("celebrates for the 24 hours after the milestone", () => {
    const insight = milestoneInsight(sinceWeMet, Date.parse("2026-11-10T20:00:00.000Z"))
    expect(insight).toMatchObject({ kind: "reached", reached: { unit: "years", count: 3 } })
  })

  it("is not reached before the milestone instant", () => {
    expect(milestoneInsight(sinceWeMet, Date.parse("2026-11-10T08:00:00.000Z"))?.kind).toBe("next")
  })

  it("shows the next milestone with its progress on other days", () => {
    const insight = milestoneInsight(sinceWeMet, Date.parse("2027-05-11T09:00:00.000Z"))
    expect(insight?.kind).toBe("next")
    if (insight?.kind !== "next") return
    expect(insight.next.count).toBe(4)
    expect(insight.progress).toBeGreaterThan(0.49)
    expect(insight.progress).toBeLessThan(0.51)
  })

  it("reports a finished ladder", () => {
    const ladder = makeTimer({
      mode: "since",
      targetDate: "2024-01-01T10:00:00.000Z",
      milestones: { rules: [{ unit: "days", at: [1, 3] }] },
    })
    expect(milestoneInsight(ladder, Date.parse("2024-02-01T10:00:00.000Z"))).toEqual({ kind: "complete" })
  })

  it("ignores countdowns", () => {
    expect(milestoneInsight(makeTimer(), Date.parse("2026-11-10T00:00:00.000Z"))).toBeNull()
  })
})

describe("calendar format", () => {
  it("counts years, months and days on the zone's wall clock", () => {
    expect(
      calendarElapsed("2023-04-20T08:00:00.000Z", "Europe/Warsaw", Date.parse("2026-11-10T12:00:00.000Z")),
    ).toEqual({ years: 3, months: 6, days: 21 })
  })

  it("does not count a day before its time of day", () => {
    expect(calendarElapsed("2026-05-10T18:00:00.000Z", "UTC", Date.parse("2026-11-10T12:00:00.000Z"))).toEqual({
      years: 0,
      months: 5,
      days: 30,
    })
  })

  it("clamps month steps to the month end", () => {
    expect(calendarElapsed("2026-01-31T10:00:00.000Z", "UTC", Date.parse("2026-02-28T11:00:00.000Z"))).toEqual({
      years: 0,
      months: 1,
      days: 0,
    })
  })

  it("leads with the largest whole unit and has no switch under a month", () => {
    expect(calendarLead({ years: 3, months: 0, days: 0 })).toEqual({ value: 3, unit: "years", rest: "" })
    expect(calendarLead({ years: 0, months: 2, days: 23 })).toEqual({ value: 2, unit: "months", rest: "23 days" })
    expect(calendarLead({ years: 3, months: 6, days: 1 })?.rest).toBe("6 months, 1 day")
    expect(calendarLead({ years: 0, months: 0, days: 29 })).toBeNull()
  })

  it("leaves the corner empty when the counter already reads the milestone", () => {
    expect(counterShowsMilestone({ unit: "days", count: 1300 }, "days", 1300, null)).toBe(true)
    expect(counterShowsMilestone({ unit: "years", count: 3 }, "days", 1096, null)).toBe(false)
    expect(
      counterShowsMilestone(
        { unit: "years", count: 3 },
        "calendar",
        1096,
        calendarLead({ years: 3, months: 0, days: 0 }),
      ),
    ).toBe(true)
    expect(
      counterShowsMilestone(
        { unit: "weeks", count: 12 },
        "calendar",
        84,
        calendarLead({ years: 0, months: 2, days: 23 }),
      ),
    ).toBe(false)
  })

  it("counts whole elapsed days", () => {
    expect(elapsedDays("2026-11-01T00:00:00.000Z", Date.parse("2026-11-10T23:00:00.000Z"))).toBe(9)
  })
})

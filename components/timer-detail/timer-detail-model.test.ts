import { describe, expect, it } from "vitest"

import {
  countdownProgress,
  countdownReminderRows,
  countUpStretch,
  countUpTrack,
  detailMilestones,
  milestoneReachedToday,
  zonedCalendarDaysBetween,
} from "@/components/timer-detail/timer-detail-model"
import type { Timer } from "@/lib/types"

const countUp: Timer = {
  id: "timer-since",
  label: "Since we met",
  targetDate: "2023-04-20T16:00:00.000Z",
  timezone: "UTC",
  createdAt: "2023-04-20T16:00:00.000Z",
  mode: "since",
  milestones: {
    rules: [
      { unit: "days", every: 100 },
      { unit: "years", every: 1 },
    ],
  },
}

const countdown: Timer = {
  id: "timer-until",
  label: "Birthday",
  targetDate: "2026-11-16T17:00:00.000Z",
  timezone: "UTC",
  createdAt: "2026-11-10T10:00:00.000Z",
  reminders: [{ offsetMinutes: 60 }, { offsetMinutes: 1440 }],
}

const milestoneDay = Date.parse("2026-11-10T16:12:44.000Z")

function amounts(list: Array<{ count: number; unit: string }>) {
  return list.map((milestone) => `${milestone.count} ${milestone.unit}`)
}

describe("count-up milestones", () => {
  it("finds the milestone reached in the last 24 hours", () => {
    expect(milestoneReachedToday(countUp, milestoneDay)).toMatchObject({ count: 1300, unit: "days" })
    expect(milestoneReachedToday(countUp, Date.parse("2026-11-11T16:12:44.000Z"))).toBeNull()
    expect(milestoneReachedToday({ ...countUp, milestones: undefined }, milestoneDay)).toBeNull()
  })

  it("lists upcoming milestones furthest first, then today, then reached ones most recent first", () => {
    const list = detailMilestones(countUp, milestoneDay, { reachedCap: 4 })
    expect(amounts(list.upcoming)).toEqual(["4 years", "1400 days"])
    expect(list.today).toMatchObject({ count: 1300, unit: "days" })
    expect(amounts(list.reached)).toEqual(["1200 days", "1100 days", "3 years", "1000 days"])
    expect(list.reachedTruncated).toBe(true)
  })

  it("does not repeat a milestone that two rules reach at the same instant", () => {
    const list = detailMilestones(
      {
        ...countUp,
        targetDate: "2021-04-20T16:00:00.000Z",
        milestones: {
          rules: [
            { unit: "days", every: 365 },
            { unit: "years", every: 1 },
          ],
        },
      },
      Date.parse("2022-06-01T00:00:00.000Z"),
      { reachedCap: 10 },
    )
    expect(amounts(list.reached)).toEqual(["1 years"])
  })

  it("shows the completed stretch on a milestone day", () => {
    const stretch = countUpStretch(countUp, milestoneDay)
    expect(stretch).toMatchObject({ reachedToday: true, fraction: 1 })
    expect(stretch?.from).toMatchObject({ count: 1200 })
    expect(stretch?.to).toMatchObject({ count: 1300 })
  })

  it("runs the stretch from the last milestone to the next one on other days", () => {
    const stretch = countUpStretch(countUp, Date.parse("2026-12-01T04:00:00.000Z"))
    expect(stretch?.reachedToday).toBe(false)
    expect(stretch?.from).toMatchObject({ count: 1300 })
    expect(stretch?.to).toMatchObject({ count: 1400 })
    expect(stretch?.fraction).toBeCloseTo(20.5 / 100, 3)
  })

  it("starts the first stretch at the anchor", () => {
    const stretch = countUpStretch(countUp, Date.parse("2023-05-20T16:00:00.000Z"))
    expect(stretch?.from).toBeNull()
    expect(stretch?.fromMs).toBe(Date.parse(countUp.targetDate))
    expect(stretch?.fraction).toBeCloseTo(0.3, 5)
  })

  it("marks reached milestones on the focus track and drops markers for dense ladders", () => {
    const track = countUpTrack(countUp, milestoneDay)
    expect(track?.next).toMatchObject({ count: 1400 })
    expect(track?.markers.length).toBe(16)
    expect(track?.markers.every((marker) => marker.fraction > 0 && marker.fraction < 1)).toBe(true)

    const daily = countUpTrack({ ...countUp, milestones: { rules: [{ unit: "days", every: 1 }] } }, milestoneDay)
    expect(daily?.markers).toEqual([])
  })
})

describe("countdown reminders and progress", () => {
  const nowMs = Date.parse("2026-11-10T11:50:00.000Z")

  it("orders reminders by when they fire and flags the ones already past", () => {
    expect(countdownReminderRows(countdown, nowMs)).toEqual([
      { offsetMinutes: 1440, atMs: Date.parse("2026-11-15T17:00:00.000Z"), past: false },
      { offsetMinutes: 60, atMs: Date.parse("2026-11-16T16:00:00.000Z"), past: false },
    ])
    expect(countdownReminderRows(countdown, Date.parse("2026-11-16T10:00:00.000Z"))[0].past).toBe(true)
    expect(countdownReminderRows(countUp, nowMs)).toEqual([])
  })

  it("places reminder markers on the bar from creation to the target", () => {
    const progress = countdownProgress(countdown, nowMs)
    const span = Date.parse(countdown.targetDate) - Date.parse(countdown.createdAt)
    expect(progress?.fraction).toBeCloseTo((nowMs - Date.parse(countdown.createdAt)) / span, 6)
    expect(progress?.reminders.map((reminder) => reminder.offsetMinutes)).toEqual([1440, 60])
    expect(progress?.reminders[1].fraction).toBeCloseTo(1 - 3_600_000 / span, 6)
  })

  it("has no bar once the target has passed", () => {
    expect(countdownProgress(countdown, Date.parse("2026-11-17T00:00:00.000Z"))).toBeNull()
  })
})

describe("zoned calendar days", () => {
  it("counts calendar days on the timer's wall clock", () => {
    const from = Date.parse("2026-11-10T22:30:00.000Z")
    const to = Date.parse("2026-11-11T22:30:00.000Z")
    expect(zonedCalendarDaysBetween(from, to, "UTC")).toBe(1)
    // 23:30 UTC is already the next day in Warsaw, though the same day in UTC.
    const lateEvening = Date.parse("2026-11-10T23:30:00.000Z")
    expect(zonedCalendarDaysBetween(Date.parse("2026-11-10T20:00:00.000Z"), lateEvening, "UTC")).toBe(0)
    expect(zonedCalendarDaysBetween(Date.parse("2026-11-10T20:00:00.000Z"), lateEvening, "Europe/Warsaw")).toBe(1)
  })
})

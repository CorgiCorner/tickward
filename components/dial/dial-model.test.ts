import { describe, expect, it } from "vitest"

import type { Timer } from "@/lib/types"

import {
  DIAL_TICK_COUNT,
  defaultDialSelection,
  dialReadout,
  dialScale,
  dialSections,
  dialTicks,
  dialTimerView,
  milestoneReachedToday,
  milestoneStretch,
  milestoneTrail,
} from "./dial-model"

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0)

function timer(overrides: Partial<Timer> & Pick<Timer, "id">): Timer {
  return {
    label: overrides.id,
    targetDate: new Date(NOW + DAY).toISOString(),
    timezone: "UTC",
    createdAt: new Date(NOW - 30 * DAY).toISOString(),
    ...overrides,
  }
}

describe("dialScale", () => {
  it("picks one tick per the largest unit that keeps the interval within 60 ticks", () => {
    expect(dialScale(42 * SECOND).unit).toBe("second")
    expect(dialScale(60 * SECOND).unit).toBe("second")
    expect(dialScale(61 * SECOND).unit).toBe("minute")
    expect(dialScale(30 * HOUR).unit).toBe("hour")
    expect(dialScale(23 * DAY).unit).toBe("day")
    expect(dialScale(120 * DAY).unit).toBe("week")
  })

  it("lights whole ticks and keeps the fraction for the leading tick", () => {
    const scale = dialScale(2 * DAY + 10 * HOUR + 30 * MINUTE)
    expect(scale.unit).toBe("hour")
    expect(scale.lit).toBe(58)
    expect(scale.leading).toBeCloseTo(0.5)
    expect(scale.progress).toBeCloseTo(58.5)
  })

  it("clamps very long intervals to a full dial and never goes negative", () => {
    expect(dialScale(4 * 365 * DAY).progress).toBe(DIAL_TICK_COUNT)
    expect(dialScale(-5 * SECOND).progress).toBe(0)
    expect(dialScale(Number.NaN).progress).toBe(0)
  })
})

describe("dialTicks", () => {
  it("draws 60 ticks with every fifth one major", () => {
    const ticks = dialTicks(12.25)
    expect(ticks).toHaveLength(60)
    expect(ticks.filter((tick) => tick.major)).toHaveLength(12)
  })

  it("lights the leading tick partly and rests the others", () => {
    const ticks = dialTicks(12.25)
    expect(ticks[11]).toMatchObject({ state: "lit", share: 1 })
    expect(ticks[12].state).toBe("leading")
    expect(ticks[12].share).toBeCloseTo(0.18 + 0.82 * 0.25)
    expect(ticks[13]).toMatchObject({ state: "rest", share: 0 })
  })
})

describe("dialReadout", () => {
  it("shows days with an hh:mm:ss clock", () => {
    expect(dialReadout(1300 * DAY + 12 * MINUTE + 44 * SECOND)).toEqual({
      value: 1300,
      unit: "days",
      clock: "00:12:44",
    })
  })

  it("shows hours with an mm:ss clock under one day", () => {
    expect(dialReadout(4 * HOUR + 5 * MINUTE + 9 * SECOND)).toEqual({ value: 4, unit: "hours", clock: "05:09" })
  })
})

describe("count-up stretch", () => {
  const since = timer({
    id: "met",
    mode: "since",
    targetDate: new Date(NOW - 1300 * DAY - 764 * SECOND).toISOString(),
  })

  it("is complete on a milestone day", () => {
    const stretch = milestoneStretch(since, NOW)
    expect(stretch?.isMilestoneDay).toBe(true)
    expect(stretch?.progress).toBe(DIAL_TICK_COUNT)
    expect(stretch?.previous?.count).toBe(1300)
    expect(stretch?.next.count).toBe(1400)
    expect(milestoneReachedToday(since, NOW)?.count).toBe(1300)
  })

  it("fills toward the next milestone once the milestone day is over", () => {
    const later = NOW + 50 * DAY
    const stretch = milestoneStretch(since, later)
    expect(stretch?.isMilestoneDay).toBe(false)
    expect(stretch?.fraction).toBeCloseTo(0.5, 2)
    expect(stretch?.progress).toBeCloseTo(30, 0)
    expect(milestoneReachedToday(since, later)).toBeNull()
  })

  it("starts its first stretch at the start", () => {
    const parcel = timer({
      id: "parcel",
      mode: "since",
      targetDate: new Date(NOW - 15 * HOUR).toISOString(),
      milestones: { rules: [{ unit: "days", at: [1, 3] }] },
    })
    const view = dialTimerView(parcel, NOW)
    expect(view.phase).toBe("countUp")
    expect(view.scaleUnit).toBeNull()
    expect(view.progress).toBeCloseTo((15 / 24) * 60)
  })

  it("reads the time gone through the scale when no milestone is left", () => {
    const done = timer({
      id: "done",
      mode: "since",
      targetDate: new Date(NOW - 10 * DAY).toISOString(),
      milestones: { rules: [{ unit: "days", at: [1, 3] }] },
    })
    const view = dialTimerView(done, NOW)
    expect(view.stretch).toBeNull()
    expect(view.scaleUnit).toBe("day")
    expect(view.progress).toBeCloseTo(10)
  })

  it("counts down to a start that is still ahead", () => {
    const ahead = timer({ id: "ahead", mode: "since", targetDate: new Date(NOW + 3 * HOUR).toISOString() })
    const view = dialTimerView(ahead, NOW)
    expect(view.phase).toBe("countdown")
    expect(view.intervalMs).toBe(3 * HOUR)
  })
})

describe("dialTimerView", () => {
  it("reads a repeating countdown at its next occurrence", () => {
    const daily = timer({
      id: "herbs",
      targetDate: new Date(Date.UTC(2026, 9, 1, 9, 45)).toISOString(),
      recurrence: { type: "daily", enabled: true },
    })
    const view = dialTimerView(daily, NOW)
    expect(view.phase).toBe("countdown")
    expect(view.instantMs).toBe(Date.UTC(2026, 10, 11, 9, 45))
    expect(view.scaleUnit).toBe("hour")
  })

  it("marks a one-off date that has passed", () => {
    const passed = timer({ id: "passed", targetDate: new Date(NOW - 2 * HOUR).toISOString() })
    const view = dialTimerView(passed, NOW)
    expect(view.phase).toBe("passed")
    expect(view.readout).toMatchObject({ value: 2, unit: "hours" })
  })
})

describe("dialSections", () => {
  const timers = [
    timer({ id: "lease", targetDate: new Date(NOW + 9 * DAY).toISOString() }),
    timer({ id: "train", targetDate: new Date(NOW + 28 * HOUR).toISOString(), pinned: true }),
    timer({ id: "herbs", targetDate: new Date(NOW + 21 * HOUR).toISOString() }),
    timer({ id: "marta", targetDate: new Date(NOW + 6 * DAY).toISOString() }),
    timer({ id: "parcel", mode: "since", targetDate: new Date(NOW - 15 * HOUR).toISOString() }),
    timer({ id: "met", mode: "since", targetDate: new Date(NOW - 1300 * DAY).toISOString() }),
    timer({ id: "old", archivedAt: new Date(NOW).toISOString() }),
  ]

  it("groups timers into the iPhone sections in order", () => {
    expect(dialSections(timers, NOW).map((section) => [section.id, section.timers.map((entry) => entry.id)])).toEqual([
      ["pinned", ["train"]],
      ["thisWeek", ["herbs", "marta"]],
      ["later", ["lease"]],
      ["countingUp", ["parcel", "met"]],
    ])
  })

  it("keeps the dashboard's own order inside each section when asked", () => {
    const sections = dialSections(timers, NOW, { keepOrder: true })
    expect(sections.map((section) => [section.id, section.timers.map((entry) => entry.id)])).toEqual([
      ["pinned", ["train"]],
      ["thisWeek", ["herbs", "marta"]],
      ["later", ["lease"]],
      ["countingUp", ["parcel", "met"]],
    ])
    const reversed = dialSections([...timers].reverse(), NOW, { keepOrder: true })
    expect(reversed.map((section) => [section.id, section.timers.map((entry) => entry.id)])).toEqual([
      ["pinned", ["train"]],
      ["thisWeek", ["marta", "herbs"]],
      ["later", ["lease"]],
      ["countingUp", ["met", "parcel"]],
    ])
  })

  it("selects the first pinned timer, else the nearest countdown", () => {
    expect(defaultDialSelection(timers, NOW)).toBe("train")
    expect(
      defaultDialSelection(
        timers.map((entry) => ({ ...entry, pinned: false })),
        NOW,
      ),
    ).toBe("herbs")
    expect(
      defaultDialSelection(
        timers.filter((entry) => entry.mode === "since"),
        NOW,
      ),
    ).toBe("parcel")
    expect(defaultDialSelection([], NOW)).toBeNull()
  })
})

describe("milestoneTrail", () => {
  it("lists reached milestones, the next one and the ones after it", () => {
    const met = timer({
      id: "met",
      mode: "since",
      targetDate: new Date(NOW - 1300 * DAY - 764 * SECOND).toISOString(),
    })
    const trail = milestoneTrail(met, NOW)
    expect(trail.map((item) => [item.milestone.count, item.state, item.today])).toEqual([
      [1200, "reached", false],
      [1300, "reached", true],
      [1400, "next", false],
      [1500, "later", false],
    ])
  })

  it("shows two later milestones before any is reached", () => {
    const parcel = timer({
      id: "parcel",
      mode: "since",
      targetDate: new Date(NOW - 15 * HOUR).toISOString(),
      milestones: { rules: [{ unit: "days", at: [1, 3, 7, 30] }] },
    })
    expect(milestoneTrail(parcel, NOW).map((item) => [item.milestone.count, item.state])).toEqual([
      [1, "next"],
      [3, "later"],
      [7, "later"],
    ])
  })

  it("is empty for countdowns", () => {
    expect(milestoneTrail(timer({ id: "train" }), NOW)).toEqual([])
  })
})

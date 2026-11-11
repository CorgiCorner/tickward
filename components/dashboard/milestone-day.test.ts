import { describe, expect, it } from "vitest"

import { isMilestoneDay, MILESTONE_DAY_MS, reachedMilestone } from "@/components/dashboard/milestone-day"
import { milestoneInsight } from "@/components/dashboard/timer-insights"
import {
  milestoneReachedToday as dialMilestoneReachedToday,
  milestoneStretch,
  milestoneTrail,
} from "@/components/dial/dial-model"
import {
  countUpStretch,
  detailMilestones,
  milestoneReachedToday as detailMilestoneReachedToday,
} from "@/components/timer-detail/timer-detail-model"
import { makeTimer } from "@/test/factories"

const SECOND = 1_000
const HOUR = 60 * 60 * SECOND

// Anchored at 22:30 in Warsaw, so the third yearly milestone lands late in the
// evening and the next calendar day starts 90 minutes later. The calendar-day
// rule and the 24-hour rule disagree for most of the window.
const sinceWeMet = makeTimer({
  id: "since-we-met",
  mode: "since",
  targetDate: "2023-11-10T21:30:00.000Z",
  timezone: "Europe/Warsaw",
  milestones: { rules: [{ unit: "years", every: 1 }] },
})
const milestoneMs = Date.parse("2026-11-10T21:30:00.000Z")

describe("isMilestoneDay", () => {
  it("runs from the milestone instant for exactly 24 hours", () => {
    expect(isMilestoneDay(milestoneMs, milestoneMs - SECOND)).toBe(false)
    expect(isMilestoneDay(milestoneMs, milestoneMs)).toBe(true)
    expect(isMilestoneDay(milestoneMs, milestoneMs + MILESTONE_DAY_MS - SECOND)).toBe(true)
    expect(isMilestoneDay(milestoneMs, milestoneMs + MILESTONE_DAY_MS)).toBe(false)
  })
})

describe("reachedMilestone", () => {
  const rules = sinceWeMet.milestones!.rules

  it("returns the milestone at its instant and keeps it past midnight on the timer's clock", () => {
    expect(reachedMilestone(sinceWeMet.targetDate, rules, sinceWeMet.timezone, milestoneMs)).toMatchObject({
      unit: "years",
      count: 3,
    })
    expect(reachedMilestone(sinceWeMet.targetDate, rules, sinceWeMet.timezone, milestoneMs + 2 * HOUR)?.count).toBe(3)
  })

  it("returns nothing before the instant, after 24 hours, without rules or before the anchor", () => {
    expect(reachedMilestone(sinceWeMet.targetDate, rules, sinceWeMet.timezone, milestoneMs - SECOND)).toBeNull()
    expect(
      reachedMilestone(sinceWeMet.targetDate, rules, sinceWeMet.timezone, milestoneMs + MILESTONE_DAY_MS),
    ).toBeNull()
    expect(reachedMilestone(sinceWeMet.targetDate, [], sinceWeMet.timezone, milestoneMs)).toBeNull()
    expect(
      reachedMilestone(sinceWeMet.targetDate, rules, sinceWeMet.timezone, Date.parse(sinceWeMet.targetDate) - SECOND),
    ).toBeNull()
  })
})

describe("every surface reads the same milestone day", () => {
  function surfaces(nowMs: number) {
    const stretch = milestoneStretch(sinceWeMet, nowMs)
    const trailToday = milestoneTrail(sinceWeMet, nowMs).some((item) => item.today)
    return {
      // The full card and the compact card both render from this insight.
      card: milestoneInsight(sinceWeMet, nowMs)?.kind === "reached",
      detail: detailMilestoneReachedToday(sinceWeMet, nowMs) !== null,
      detailList: detailMilestones(sinceWeMet, nowMs).today !== null,
      detailStretch: countUpStretch(sinceWeMet, nowMs)?.reachedToday === true,
      dial: dialMilestoneReachedToday(sinceWeMet, nowMs) !== null,
      dialStretch: stretch?.isMilestoneDay === true,
      dialTrail: trailToday,
    }
  }

  const all = (value: boolean) => ({
    card: value,
    detail: value,
    detailList: value,
    detailStretch: value,
    dial: value,
    dialStretch: value,
    dialTrail: value,
  })

  it.each([
    ["one second before the milestone", milestoneMs - SECOND, false],
    ["at the milestone instant", milestoneMs, true],
    ["after midnight on the timer's clock", milestoneMs + 2 * HOUR, true],
    ["one second before 24 hours have passed", milestoneMs + MILESTONE_DAY_MS - SECOND, true],
    ["24 hours after the milestone", milestoneMs + MILESTONE_DAY_MS, false],
  ])("%s", (_name, nowMs, expected) => {
    expect(surfaces(nowMs)).toEqual(all(expected))
  })
})

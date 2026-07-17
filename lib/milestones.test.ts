import { fromZonedTime } from "date-fns-tz"
import { describe, expect, it } from "vitest"

import {
  duplicateMilestoneRuleIndexes,
  lastMilestoneBefore,
  MILESTONE_UNITS,
  nextMilestoneAfter,
  ruleAmountAt,
  ruleKey,
  timerMilestonesSchema,
  upcomingMilestones,
} from "@/lib/milestones"
import { nextOccurrenceAfter } from "@/lib/utils"
import { makeTimer } from "@/test/factories"

const TZ = "Europe/Warsaw"
const iso = (wall: string) => fromZonedTime(wall, TZ).toISOString()

describe("milestone derivation (no mutation)", () => {
  it("steps day milestones on wall-clock days across DST", () => {
    const anchor = iso("2026-01-15T14:00:00")
    const next = nextMilestoneAfter(anchor, [{ unit: "days", every: 100 }], TZ, new Date(anchor).getTime())
    expect(next).toEqual({ at: iso("2026-04-25T14:00:00"), unit: "days", count: 100 })
  })

  it("clamps monthly milestones to the end of shorter months", () => {
    const anchor = iso("2026-01-31T09:00:00")
    const first = nextMilestoneAfter(anchor, [{ unit: "months", every: 1 }], TZ, new Date(anchor).getTime())
    expect(first).toEqual({ at: iso("2026-02-28T09:00:00"), unit: "months", count: 1 })
    const second = nextMilestoneAfter(anchor, [{ unit: "months", every: 1 }], TZ, new Date(first!.at).getTime())
    expect(second).toEqual({ at: iso("2026-03-31T09:00:00"), unit: "months", count: 2 })
  })

  it("clamps Feb 29 anniversaries to Feb 28 in common years and restores them in leap years", () => {
    const anchor = iso("2024-02-29T08:00:00")
    const y1 = nextMilestoneAfter(anchor, [{ unit: "years", every: 1 }], TZ, new Date(anchor).getTime())
    expect(y1!.at).toBe(iso("2025-02-28T08:00:00"))
    const y4 = nextMilestoneAfter(
      anchor,
      [{ unit: "years", every: 1 }],
      TZ,
      new Date(iso("2027-06-01T00:00:00")).getTime(),
    )
    expect(y4!.at).toBe(iso("2028-02-29T08:00:00"))
  })

  it("returns the strictly-next occurrence (boundary excluded)", () => {
    const anchor = iso("2026-01-01T10:00:00")
    const m1 = iso("2026-01-08T10:00:00")
    const at = nextMilestoneAfter(anchor, [{ unit: "weeks", every: 1 }], TZ, new Date(m1).getTime())
    expect(at!.at).toBe(iso("2026-01-15T10:00:00"))
  })

  it("labels ties with the larger unit", () => {
    const anchor = iso("2026-01-15T10:00:00")
    const rules = [
      { unit: "months" as const, every: 12 },
      { unit: "years" as const, every: 1 },
    ]
    const next = nextMilestoneAfter(anchor, rules, TZ, new Date(anchor).getTime())
    expect(next!.unit).toBe("years")
    expect(next!.count).toBe(1)
  })

  it("keeps lastMilestoneBefore and nextMilestoneAfter consistent around now", () => {
    const anchor = iso("2020-03-10T12:00:00")
    const rules = [
      { unit: "days" as const, every: 100 },
      { unit: "years" as const, every: 1 },
    ]
    const nowMs = new Date(iso("2026-07-16T00:00:00")).getTime()
    const last = lastMilestoneBefore(anchor, rules, TZ, nowMs)
    const next = nextMilestoneAfter(anchor, rules, TZ, nowMs)
    expect(new Date(last!.at).getTime()).toBeLessThanOrEqual(nowMs)
    expect(new Date(next!.at).getTime()).toBeGreaterThan(nowMs)
    expect(nextMilestoneAfter(anchor, rules, TZ, new Date(last!.at).getTime())!.at).toBe(next!.at)
  })

  it("merges multiple rules in upcomingMilestones, sorted and deduped by instant", () => {
    const anchor = iso("2026-01-01T10:00:00")
    const rules = [
      { unit: "weeks" as const, every: 2 },
      { unit: "days" as const, every: 10 },
    ]
    const list = upcomingMilestones(anchor, rules, TZ, new Date(anchor).getTime(), 5)
    expect(list).toHaveLength(5)
    const times = list.map((milestone) => new Date(milestone.at).getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(new Set(times).size).toBe(times.length)
  })

  it("finds frequent milestones for century-old anchors without a walk limit", () => {
    const anchor = iso("1900-01-01T10:00:00")
    const afterMs = new Date(iso("2026-01-01T10:00:00")).getTime()

    const next = nextMilestoneAfter(anchor, [{ unit: "days", every: 1 }], TZ, afterMs)

    expect(next).toEqual({ at: iso("2026-01-02T10:00:00"), unit: "days", count: 46_022 })
  })

  it("rejects duplicate rules in the schema", () => {
    const result = timerMilestonesSchema.safeParse({
      rules: [
        { unit: "days", every: 100 },
        { unit: "days", every: 100 },
      ],
    })
    expect(result.success).toBe(false)
    expect(
      duplicateMilestoneRuleIndexes([
        { unit: "days", every: 100 },
        { unit: "years", every: 1 },
        { unit: "days", every: 100 },
      ]),
    ).toEqual([2])
    expect(ruleKey({ unit: "days", every: 7 })).toBe("days:every:7")
    expect(ruleKey({ unit: "days", at: [1, 3, 7] })).toBe("days:at:1,3,7")
    expect(
      duplicateMilestoneRuleIndexes([
        { unit: "days", at: [1, 3, 7] },
        { unit: "days", every: 7 },
        { unit: "days", at: [1, 3, 7] },
      ]),
    ).toEqual([2])
  })

  it("keeps v1 periodic rules backward compatible", () => {
    expect(timerMilestonesSchema.safeParse({ rules: [{ unit: "days", every: 100 }] }).success).toBe(true)
    expect(ruleAmountAt({ unit: "days", every: 100 }, 3)).toBe(300)
    expect(ruleAmountAt({ unit: "days", at: [1, 3, 7] }, 2)).toBe(3)
    expect(ruleAmountAt({ unit: "days", at: [1, 3, 7] }, 4)).toBeNull()
  })

  it("supports strictly-next boundaries, single-item ladders, and exhaustion", () => {
    const anchor = iso("2026-01-01T10:00:00")
    const day1 = iso("2026-01-02T10:00:00")

    expect(nextMilestoneAfter(anchor, [{ unit: "days", at: [1] }], TZ, new Date(anchor).getTime())).toEqual({
      at: day1,
      unit: "days",
      count: 1,
    })
    expect(nextMilestoneAfter(anchor, [{ unit: "days", at: [1] }], TZ, new Date(day1).getTime())).toBeNull()

    const rules = [{ unit: "days" as const, at: [1, 3, 7] }]
    expect(nextMilestoneAfter(anchor, rules, TZ, new Date(iso("2026-01-04T10:00:00")).getTime())).toEqual({
      at: iso("2026-01-08T10:00:00"),
      unit: "days",
      count: 7,
    })
    expect(nextMilestoneAfter(anchor, rules, TZ, new Date(iso("2026-01-08T10:00:00")).getTime())).toBeNull()
  })

  it("keeps the final explicit amount in lastMilestoneBefore after exhaustion", () => {
    const anchor = iso("2026-01-01T10:00:00")
    expect(
      lastMilestoneBefore(
        anchor,
        [{ unit: "days", at: [1, 3, 7] }],
        TZ,
        new Date(iso("2026-02-01T10:00:00")).getTime(),
      ),
    ).toEqual({ at: iso("2026-01-08T10:00:00"), unit: "days", count: 7 })
  })

  it("merges periodic and explicit rules with larger-unit tie-breaking", () => {
    const anchor = iso("2026-01-01T10:00:00")
    const list = upcomingMilestones(
      anchor,
      [
        { unit: "days", at: [7] },
        { unit: "weeks", every: 1 },
      ],
      TZ,
      new Date(anchor).getTime(),
      3,
    )

    expect(list).toEqual([
      { at: iso("2026-01-08T10:00:00"), unit: "weeks", count: 1 },
      { at: iso("2026-01-15T10:00:00"), unit: "weeks", count: 2 },
      { at: iso("2026-01-22T10:00:00"), unit: "weeks", count: 3 },
    ])
  })

  it("clamps explicit month amounts independently from the anchor", () => {
    const anchor = iso("2026-01-31T09:00:00")
    expect(upcomingMilestones(anchor, [{ unit: "months", at: [1, 3] }], TZ, new Date(anchor).getTime(), 3)).toEqual([
      { at: iso("2026-02-28T09:00:00"), unit: "months", count: 1 },
      { at: iso("2026-04-30T09:00:00"), unit: "months", count: 3 },
    ])
  })

  it("rejects non-canonical explicit rule shapes", () => {
    for (const rule of [
      { unit: "days", at: [3, 1] },
      { unit: "days", at: [1, 1] },
      { unit: "days", every: 7, at: [7] },
    ]) {
      expect(timerMilestonesSchema.safeParse({ rules: [rule] }).success).toBe(false)
    }
  })

  it("keeps random ascending ladders sorted, unique, and round-trippable", () => {
    let seed = 0x5eed
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
      return seed / 0x1_0000_0000
    }

    for (let sample = 0; sample < 50; sample++) {
      const length = 1 + Math.floor(random() * 12)
      const amounts = new Set<number>()
      while (amounts.size < length) amounts.add(1 + Math.floor(random() * 10_000))
      const at = [...amounts].sort((a, b) => a - b)
      const anchor = iso("2000-01-31T09:00:00")
      const rule = { unit: MILESTONE_UNITS[sample % MILESTONE_UNITS.length], at }
      const list = upcomingMilestones(anchor, [rule], TZ, new Date(anchor).getTime(), 12)
      const times = list.map((milestone) => new Date(milestone.at).getTime())

      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(new Set(times).size).toBe(times.length)
      const timer = makeTimer({
        mode: "since",
        targetDate: anchor,
        timezone: TZ,
        milestones: { rules: [rule] },
      })
      for (const occurrence of list) {
        expect(nextOccurrenceAfter(timer, new Date(occurrence.at).getTime() - 1)).toEqual({
          at: occurrence.at,
          milestone: { unit: occurrence.unit, count: occurrence.count },
        })
      }
    }
  })
})

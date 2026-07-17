import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { z } from "zod"

import { normalizeTimeZone } from "@/lib/timezones"

// ---- Derived milestones for "since" timers -----------------------------------
//
// A since-timer counts up from an anchor instant (`targetDate`). Its milestones
// ("100 days", "1 year") are derived from rules, mirroring slot recurrence in
// lib/utils.ts: occurrences are computed, never stored, so the next celebration
// is always correct regardless of when the app last ran. Calendar units clamp
// to month end (Jan 31 + 1 month = Feb 28) — distance-since must never skip a
// celebration, unlike RRULE-style recurrence which skips missing dates.

export const MILESTONE_UNITS = ["days", "weeks", "months", "years"] as const
export type MilestoneUnit = (typeof MILESTONE_UNITS)[number]

export const MILESTONE_EVERY_MIN = 1
export const MILESTONE_EVERY_MAX = 1000
export const MILESTONE_AT_MAX = 10_000
export const MAX_MILESTONE_AT_ITEMS = 12
export const MAX_TIMER_MILESTONE_RULES = 4

const periodicMilestoneRuleSchema = z
  .object({
    unit: z.enum(MILESTONE_UNITS),
    every: z.number().int().min(MILESTONE_EVERY_MIN).max(MILESTONE_EVERY_MAX),
  })
  .strict()

const explicitMilestoneRuleSchema = z
  .object({
    unit: z.enum(MILESTONE_UNITS),
    at: z.array(z.number().int().min(1).max(MILESTONE_AT_MAX)).min(1).max(MAX_MILESTONE_AT_ITEMS),
  })
  .strict()
  .superRefine((rule, ctx) => {
    for (let index = 1; index < rule.at.length; index++) {
      if (rule.at[index] > rule.at[index - 1]) continue
      ctx.addIssue({
        code: "custom",
        message: "Milestone amounts must be strictly ascending and unique.",
        path: ["at", index],
      })
    }
  })

export const milestoneRuleSchema = z.union([periodicMilestoneRuleSchema, explicitMilestoneRuleSchema])

export const timerMilestonesSchema = z
  .object({ rules: z.array(milestoneRuleSchema).min(1).max(MAX_TIMER_MILESTONE_RULES) })
  .strict()
  .superRefine((milestones, ctx) => {
    for (const index of duplicateMilestoneRuleIndexes(milestones.rules)) {
      ctx.addIssue({
        code: "custom",
        message: "Milestone rules must be unique.",
        path: ["rules", index],
      })
    }
  })

export type MilestoneRule = z.infer<typeof milestoneRuleSchema>
export type TimerMilestones = z.infer<typeof timerMilestonesSchema>

export type MilestoneOccurrence = {
  at: string
  unit: MilestoneUnit
  count: number
}

export function ruleKey(rule: MilestoneRule): string {
  return "every" in rule ? `${rule.unit}:every:${rule.every}` : `${rule.unit}:at:${rule.at.join(",")}`
}

export function duplicateMilestoneRuleIndexes(rules: ReadonlyArray<MilestoneRule>): number[] {
  const seen = new Set<string>()
  const duplicates: number[] = []
  for (const [index, rule] of rules.entries()) {
    const key = ruleKey(rule)
    if (seen.has(key)) duplicates.push(index)
    seen.add(key)
  }
  return duplicates
}

// Larger unit first — also the tie-break order for simultaneous occurrences.
const UNIT_PRIORITY: MilestoneUnit[] = ["years", "months", "weeks", "days"]

// Upper bounds per unit, so the k-estimate below never overshoots the true k.
const MAX_UNIT_MS: Record<MilestoneUnit, number> = {
  days: 25 * 60 * 60_000,
  weeks: 7 * 25 * 60 * 60_000,
  months: 31 * 24 * 60 * 60_000 + 60 * 60_000,
  years: 366 * 24 * 60 * 60_000 + 60 * 60_000,
}

type AnchorParts = { y: number; mo: number; d: number; time: string }

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

function anchorParts(anchorIso: string, zone: string): AnchorParts {
  const anchorMs = new Date(anchorIso).getTime()
  return {
    y: Number(formatInTimeZone(anchorMs, zone, "yyyy")),
    mo: Number(formatInTimeZone(anchorMs, zone, "MM")),
    d: Number(formatInTimeZone(anchorMs, zone, "dd")),
    time: formatInTimeZone(anchorMs, zone, "HH:mm"),
  }
}

// Instant of anchor + amount*unit, resolved in `zone`. Day/week stepping walks
// wall-clock dates (local time-of-day survives DST); month/year stepping shifts
// the calendar component and clamps the day to the target month's length.
function milestoneInstantMs(anchor: AnchorParts, unit: MilestoneUnit, amount: number, zone: string): number {
  let { y, mo, d } = anchor
  if (unit === "days" || unit === "weeks") {
    const proxy = new Date(Date.UTC(y, mo - 1, d))
    proxy.setUTCDate(proxy.getUTCDate() + amount * (unit === "weeks" ? 7 : 1))
    y = proxy.getUTCFullYear()
    mo = proxy.getUTCMonth() + 1
    d = proxy.getUTCDate()
  } else if (unit === "months") {
    const total = mo - 1 + amount
    y += Math.floor(total / 12)
    mo = (total % 12) + 1
    d = Math.min(d, daysInMonth(y, mo))
  } else {
    y += amount
    d = Math.min(d, daysInMonth(y, mo))
  }
  return fromZonedTime(`${y}-${pad2(mo)}-${pad2(d)}T${anchor.time}:00`, zone).getTime()
}

export function ruleAmountAt(rule: MilestoneRule, k: number): number | null {
  if (!Number.isInteger(k) || k < 1) return null
  return "every" in rule ? k * rule.every : (rule.at[k - 1] ?? null)
}

function ruleOccurrence(anchorIso: string, rule: MilestoneRule, zone: string, k: number): MilestoneOccurrence | null {
  const anchor = anchorParts(anchorIso, zone)
  const amount = ruleAmountAt(rule, k)
  if (amount === null) return null
  return {
    at: new Date(milestoneInstantMs(anchor, rule.unit, amount, zone)).toISOString(),
    unit: rule.unit,
    count: amount,
  }
}

/** Smallest k >= 1 whose occurrence is strictly after `afterMs`. */
function nextKForRule(anchorIso: string, rule: MilestoneRule, zone: string, afterMs: number): number | null {
  const anchor = anchorParts(anchorIso, zone)
  if ("at" in rule) {
    let low = 0
    let high = rule.at.length
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2)
      if (milestoneInstantMs(anchor, rule.unit, rule.at[middle], zone) > afterMs) high = middle
      else low = middle + 1
    }
    return low < rule.at.length ? low + 1 : null
  }

  const anchorMs = new Date(anchorIso).getTime()
  // Underestimate k via the unit's maximum span, then bracket and binary-search
  // the answer. This stays bounded even for century-old anchors with an
  // every-one-day rule. Instants are monotonic in k (clamping never reorders).
  const spanMs = MAX_UNIT_MS[rule.unit] * rule.every
  let low = Math.max(0, Math.floor((afterMs - anchorMs) / spanMs))
  let high = Math.max(1, low + 1)

  let highAmount = ruleAmountAt(rule, high)
  if (highAmount === null) return null
  while (milestoneInstantMs(anchor, rule.unit, highAmount, zone) <= afterMs) {
    low = high
    high *= 2
    if (!Number.isSafeInteger(high * rule.every)) return null
    highAmount = ruleAmountAt(rule, high)
    if (highAmount === null) return null
  }

  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2)
    const middleAmount = ruleAmountAt(rule, middle)
    if (middleAmount === null) return null
    if (milestoneInstantMs(anchor, rule.unit, middleAmount, zone) > afterMs) {
      high = middle
    } else {
      low = middle
    }
  }
  return high
}

export function nextMilestoneAfter(
  anchorIso: string,
  rules: MilestoneRule[],
  tz: string,
  afterMs: number,
): MilestoneOccurrence | null {
  const zone = normalizeTimeZone(tz)
  let best: MilestoneOccurrence | null = null
  const ordered = [...rules].sort((a, b) => UNIT_PRIORITY.indexOf(a.unit) - UNIT_PRIORITY.indexOf(b.unit))
  for (const rule of ordered) {
    const k = nextKForRule(anchorIso, rule, zone, afterMs)
    if (k === null) continue
    const candidate = ruleOccurrence(anchorIso, rule, zone, k)
    if (!candidate) continue
    // Strict < keeps the earlier-seen (larger-unit) label on ties.
    if (!best || new Date(candidate.at).getTime() < new Date(best.at).getTime()) best = candidate
  }
  return best
}

export function lastMilestoneBefore(
  anchorIso: string,
  rules: MilestoneRule[],
  tz: string,
  nowMs: number,
): MilestoneOccurrence | null {
  const zone = normalizeTimeZone(tz)
  let best: MilestoneOccurrence | null = null
  const ordered = [...rules].sort((a, b) => UNIT_PRIORITY.indexOf(a.unit) - UNIT_PRIORITY.indexOf(b.unit))
  for (const rule of ordered) {
    const nextK = nextKForRule(anchorIso, rule, zone, nowMs)
    const k = nextK === null ? ("at" in rule ? rule.at.length : 0) : nextK - 1
    if (k < 1) continue
    const candidate = ruleOccurrence(anchorIso, rule, zone, k)
    if (!candidate) continue
    if (!best || new Date(candidate.at).getTime() > new Date(best.at).getTime()) best = candidate
  }
  return best
}

/** The next `count` milestone instants after `fromMs`, merged across rules and deduped by instant. */
export function upcomingMilestones(
  anchorIso: string,
  rules: MilestoneRule[],
  tz: string,
  fromMs: number,
  count: number,
): MilestoneOccurrence[] {
  const out: MilestoneOccurrence[] = []
  let cursorMs = fromMs
  while (out.length < count) {
    const next = nextMilestoneAfter(anchorIso, rules, tz, cursorMs)
    if (!next) break
    out.push(next)
    cursorMs = new Date(next.at).getTime()
  }
  return out
}

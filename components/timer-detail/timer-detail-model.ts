import { differenceInCalendarDays } from "date-fns"
import { toZonedTime } from "date-fns-tz"

import { reachedMilestone } from "@/components/dashboard/milestone-day"
import { lastMilestoneBefore, nextMilestoneAfter, type MilestoneOccurrence } from "@/lib/milestones"
import { normalizeTimeZone } from "@/lib/timezones"
import type { Timer } from "@/lib/types"
import { effectiveTargetDate, recurrenceHistory } from "@/lib/utils"

// Pure derivations for the timer detail view and focus mode. Everything is
// computed from the timer and the current instant, never stored.

export function isCountUpTimer(timer: Pick<Timer, "mode">) {
  return timer.mode === "since"
}

/** The instant the counter runs against: the anchor for count-ups, the next occurrence otherwise. */
export function detailTarget(timer: Timer, nowMs: number) {
  return isCountUpTimer(timer) ? timer.targetDate : effectiveTargetDate(timer, nowMs)
}

/** Whole calendar days from `fromMs` to `toMs` on the timer's wall clock. */
export function zonedCalendarDaysBetween(fromMs: number, toMs: number, timezone: string) {
  const zone = normalizeTimeZone(timezone)
  return differenceInCalendarDays(toZonedTime(toMs, zone), toZonedTime(fromMs, zone))
}

function milestoneMs(milestone: MilestoneOccurrence) {
  return new Date(milestone.at).getTime()
}

function milestoneRules(timer: Timer) {
  return isCountUpTimer(timer) ? (timer.milestones?.rules ?? []) : []
}

/** The milestone reached in the last 24 hours, if any (the shared milestone-day rule). */
export function milestoneReachedToday(timer: Timer, nowMs: number): MilestoneOccurrence | null {
  return reachedMilestone(timer.targetDate, milestoneRules(timer), timer.timezone, nowMs)
}

/** Reached milestones at or before `beforeMs`, most recent first, at most `cap`. */
export function reachedMilestones(timer: Timer, beforeMs: number, cap: number): MilestoneOccurrence[] {
  const rules = milestoneRules(timer)
  const out: MilestoneOccurrence[] = []
  let cursorMs = beforeMs
  while (rules.length > 0 && out.length < cap) {
    const previous = lastMilestoneBefore(timer.targetDate, rules, timer.timezone, cursorMs)
    if (!previous) break
    out.push(previous)
    cursorMs = milestoneMs(previous) - 1
  }
  return out
}

export type DetailMilestones = {
  /** The next milestones, furthest first, so the list reads from the future down to the past. */
  upcoming: MilestoneOccurrence[]
  today: MilestoneOccurrence | null
  /** Reached before today, most recent first. */
  reached: MilestoneOccurrence[]
  /** True when more reached milestones exist than `reachedCap`. */
  reachedTruncated: boolean
}

export function detailMilestones(
  timer: Timer,
  nowMs: number,
  options: { upcomingCount?: number; reachedCap?: number } = {},
): DetailMilestones {
  const upcomingCount = options.upcomingCount ?? 2
  const reachedCap = options.reachedCap ?? 100
  const rules = milestoneRules(timer)
  if (rules.length === 0) return { upcoming: [], today: null, reached: [], reachedTruncated: false }

  const upcoming: MilestoneOccurrence[] = []
  let cursorMs = nowMs
  while (upcoming.length < upcomingCount) {
    const next = nextMilestoneAfter(timer.targetDate, rules, timer.timezone, cursorMs)
    if (!next) break
    upcoming.push(next)
    cursorMs = milestoneMs(next)
  }

  const today = milestoneReachedToday(timer, nowMs)
  const reachedStart = today ? milestoneMs(today) - 1 : nowMs
  const reached = reachedMilestones(timer, reachedStart, reachedCap + 1)
  return {
    upcoming: upcoming.reverse(),
    today,
    reached: reached.slice(0, reachedCap),
    reachedTruncated: reached.length > reachedCap,
  }
}

export type CountUpStretch = {
  /** The milestone the stretch starts at; null when it starts at the anchor. */
  from: MilestoneOccurrence | null
  to: MilestoneOccurrence
  fromMs: number
  toMs: number
  fraction: number
  reachedToday: boolean
}

/**
 * The stretch between two milestones the count-up is on. On a milestone day
 * the stretch that just closed shows complete; otherwise it runs from the last
 * reached milestone (or the anchor) to the next one.
 */
export function countUpStretch(timer: Timer, nowMs: number): CountUpStretch | null {
  const rules = milestoneRules(timer)
  const anchorMs = new Date(timer.targetDate).getTime()
  if (rules.length === 0 || !Number.isFinite(anchorMs) || anchorMs > nowMs) return null

  const today = milestoneReachedToday(timer, nowMs)
  if (today) {
    const from = lastMilestoneBefore(timer.targetDate, rules, timer.timezone, milestoneMs(today) - 1)
    return {
      from,
      to: today,
      fromMs: from ? milestoneMs(from) : anchorMs,
      toMs: milestoneMs(today),
      fraction: 1,
      reachedToday: true,
    }
  }

  const to = nextMilestoneAfter(timer.targetDate, rules, timer.timezone, nowMs)
  if (!to) return null
  const from = lastMilestoneBefore(timer.targetDate, rules, timer.timezone, nowMs)
  const fromMs = from ? milestoneMs(from) : anchorMs
  const toMs = milestoneMs(to)
  return {
    from,
    to,
    fromMs,
    toMs,
    fraction: clampFraction((nowMs - fromMs) / (toMs - fromMs)),
    reachedToday: false,
  }
}

function clampFraction(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export type CountdownReminderRow = {
  offsetMinutes: number
  atMs: number
  past: boolean
}

/** The timer's reminders for its next occurrence, in the order they fire. */
export function countdownReminderRows(timer: Timer, nowMs: number): CountdownReminderRow[] {
  if (isCountUpTimer(timer)) return []
  const targetMs = new Date(detailTarget(timer, nowMs)).getTime()
  if (!Number.isFinite(targetMs)) return []
  return (timer.reminders ?? [])
    .map((reminder) => {
      const atMs = targetMs - reminder.offsetMinutes * 60_000
      return { offsetMinutes: reminder.offsetMinutes, atMs, past: atMs <= nowMs }
    })
    .sort((a, b) => a.atMs - b.atMs)
}

export type CountdownProgress = {
  startMs: number
  targetMs: number
  fraction: number
  reminders: Array<CountdownReminderRow & { fraction: number }>
}

/**
 * Progress from the start of the current cycle (creation, or the previous
 * occurrence of a repeating timer) to the target, with reminder positions.
 * Null once the target has passed, like the card.
 */
export function countdownProgress(timer: Timer, nowMs: number): CountdownProgress | null {
  if (isCountUpTimer(timer)) return null
  const targetMs = new Date(detailTarget(timer, nowMs)).getTime()
  const history = timer.recurrence?.enabled ? recurrenceHistory(timer, nowMs) : null
  const startMs = new Date(history?.last ?? timer.createdAt).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(targetMs) || targetMs <= startMs || targetMs <= nowMs) return null

  const span = targetMs - startMs
  return {
    startMs,
    targetMs,
    fraction: clampFraction((nowMs - startMs) / span),
    reminders: countdownReminderRows(timer, nowMs)
      .filter((row) => row.atMs > startMs && row.atMs < targetMs)
      .map((row) => ({ ...row, fraction: (row.atMs - startMs) / span })),
  }
}

export type CountUpTrack = {
  startMs: number
  next: MilestoneOccurrence
  nextMs: number
  fraction: number
  /** Reached milestones between the anchor and now; empty when too many to draw. */
  markers: Array<MilestoneOccurrence & { fraction: number }>
}

/**
 * Focus mode's count-up bar: from the anchor to the next milestone, with a
 * marker at each milestone already reached. Dense ladders (more than
 * `maxMarkers` reached) draw no markers instead of a smear.
 */
export function countUpTrack(timer: Timer, nowMs: number, maxMarkers = 24): CountUpTrack | null {
  const rules = milestoneRules(timer)
  const startMs = new Date(timer.targetDate).getTime()
  if (rules.length === 0 || !Number.isFinite(startMs) || startMs > nowMs) return null
  const next = nextMilestoneAfter(timer.targetDate, rules, timer.timezone, nowMs)
  if (!next) return null

  const nextMs = milestoneMs(next)
  const span = nextMs - startMs
  const reached = reachedMilestones(timer, nowMs, maxMarkers + 1)
  return {
    startMs,
    next,
    nextMs,
    fraction: clampFraction((nowMs - startMs) / span),
    markers:
      reached.length > maxMarkers
        ? []
        : reached.map((milestone) => ({ ...milestone, fraction: (milestoneMs(milestone) - startMs) / span })),
  }
}

import { formatInTimeZone } from "date-fns-tz"

import type { CountUpFormat } from "@/components/dashboard/count-up-format"
import { isMilestoneDay } from "@/components/dashboard/milestone-day"
import { getActiveLocale } from "@/lib/i18n/active-locale"
import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import { lastMilestoneBefore, nextMilestoneAfter, type MilestoneOccurrence, type MilestoneUnit } from "@/lib/milestones"
import { timerNotificationsEnabled } from "@/lib/notification-preferences"
import { normalizeTimeZone } from "@/lib/timezones"
import type { Timer } from "@/lib/types"
import { pad2, type CountdownParts } from "@/lib/utils"

// ---- Pure helpers behind the timer card's content ----------------------------
//
// The card shows one counter, one date line and, on the right, what comes next:
// the next milestone for a count-up, the next reminder for a countdown. These
// helpers keep that logic out of the components so it can be tested directly.

const DAY_MS = 24 * 60 * 60_000

export type CountdownSegment = {
  key: "days" | "hours" | "minutes" | "seconds"
  value: string
  label: string
  muted?: boolean
}

/** Counter segments with one set of unit labels; no "0 days" segment under a day. */
export function countdownSegments(parts: Pick<CountdownParts, "days" | "hours" | "minutes" | "seconds">) {
  const segments: CountdownSegment[] = []
  if (parts.days > 0) {
    // references: timer.countdown.dayUnit.one / timer.countdown.dayUnit.few / timer.countdown.dayUnit.many
    segments.push({
      key: "days",
      value: formatGroupedNumber(parts.days),
      label: formatPluralMessage("timer.countdown.dayUnit", parts.days),
    })
  }
  segments.push(
    { key: "hours", value: pad2(parts.hours), label: formatMessage("timer.countdown.hoursShort") },
    { key: "minutes", value: pad2(parts.minutes), label: formatMessage("timer.countdown.minutesShort") },
    { key: "seconds", value: pad2(parts.seconds), label: formatMessage("timer.countdown.secondsShort"), muted: true },
  )
  return segments
}

export function formatGroupedNumber(value: number) {
  return new Intl.NumberFormat(getActiveLocale(), { maximumFractionDigits: 0 }).format(value)
}

// ---- Countdowns: the next reminder --------------------------------------------

export type NextReminder = {
  offsetMinutes: number
  atMs: number
}

/** The earliest reminder of a countdown that is still ahead of `nowMs`. */
export function nextReminder(timer: Timer, effectiveTargetIso: string, nowMs: number): NextReminder | null {
  if (timer.mode === "since" || !timer.reminders?.length) return null
  if (!timerNotificationsEnabled(timer.notification, timer.notify)) return null
  const targetMs = new Date(effectiveTargetIso).getTime()
  if (!Number.isFinite(targetMs)) return null

  let best: NextReminder | null = null
  for (const reminder of timer.reminders) {
    const atMs = targetMs - reminder.offsetMinutes * 60_000
    if (atMs <= nowMs) continue
    if (!best || atMs < best.atMs) best = { offsetMinutes: reminder.offsetMinutes, atMs }
  }
  return best
}

function dayKey(ms: number, zone: string) {
  return formatInTimeZone(ms, zone, "yyyy-MM-dd")
}

/** "today 16:00", "tomorrow 09:00", "Sun 18:00" or "Nov 19" for a moment ahead. */
export function formatUpcomingMoment(atMs: number, nowMs: number, timezone: string) {
  const zone = normalizeTimeZone(timezone)
  const time = formatInTimeZone(atMs, zone, "HH:mm")
  const atDay = dayKey(atMs, zone)
  if (atDay === dayKey(nowMs, zone)) return formatMessage("timer.card.today", { time })
  if (atDay === dayKey(nowMs + DAY_MS, zone)) return formatMessage("timer.card.tomorrow", { time })
  const locale = getActiveLocale()
  if (atMs - nowMs < 6 * DAY_MS) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: zone }).format(atMs)
    return `${weekday} ${time}`
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: zone }).format(atMs)
}

/** "in 9 h 10 min", "in 3 days". */
export function formatTimeUntil(atMs: number, nowMs: number) {
  const remainingMs = Math.max(0, atMs - nowMs)
  const days = Math.floor(remainingMs / DAY_MS)
  if (days >= 1) {
    return formatMessage("timer.card.inDuration", {
      duration: `${formatGroupedNumber(days)} ${formatPluralMessage("milestone.unit.days", days)}`,
    })
  }
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return formatMessage("timer.card.inDuration", {
    duration:
      hours > 0
        ? formatMessage("timer.card.hoursMinutes", { hours, minutes })
        : formatMessage("timer.card.minutes", { minutes }),
  })
}

// ---- Count-ups: milestones -----------------------------------------------------

export type MilestoneInsight =
  | { kind: "next"; next: MilestoneOccurrence; progress: number }
  | { kind: "reached"; reached: MilestoneOccurrence; next: MilestoneOccurrence | null }
  | { kind: "complete" }

/**
 * Where a count-up stands against its milestone rules. For the 24 hours after a
 * milestone is reached (the shared milestone-day rule) the card celebrates it;
 * otherwise it shows the next milestone and the progress towards it.
 */
export function milestoneInsight(timer: Timer, nowMs: number): MilestoneInsight | null {
  if (timer.mode !== "since" || !timer.milestones?.rules.length) return null
  const anchorMs = new Date(timer.targetDate).getTime()
  if (!Number.isFinite(anchorMs) || anchorMs > nowMs) return null

  const zone = normalizeTimeZone(timer.timezone)
  const rules = timer.milestones.rules
  const last = lastMilestoneBefore(timer.targetDate, rules, zone, nowMs)
  const next = nextMilestoneAfter(timer.targetDate, rules, zone, nowMs)

  if (last && isMilestoneDay(new Date(last.at).getTime(), nowMs)) {
    return { kind: "reached", reached: last, next }
  }
  if (next) {
    const startMs = last ? new Date(last.at).getTime() : anchorMs
    const endMs = new Date(next.at).getTime()
    const span = endMs - startMs
    const progress = span > 0 ? Math.max(0, Math.min(1, (nowMs - startMs) / span)) : 0
    return { kind: "next", next, progress }
  }
  if (rules.every((rule) => "at" in rule)) return { kind: "complete" }
  return null
}

export function formatMilestoneAmount(milestone: Pick<MilestoneOccurrence, "count" | "unit">) {
  return `${formatGroupedNumber(milestone.count)} ${formatPluralMessage(`milestone.unit.${milestone.unit}`, milestone.count)}`
}

/** Whole days since the anchor, the number the counter shows by default. */
export function elapsedDays(anchorIso: string, nowMs: number) {
  const anchorMs = new Date(anchorIso).getTime()
  if (!Number.isFinite(anchorMs) || anchorMs > nowMs) return 0
  return Math.floor((nowMs - anchorMs) / DAY_MS)
}

// ---- Count-ups: the calendar format ---------------------------------------------

export type CalendarElapsed = { years: number; months: number; days: number }

type WallClock = { y: number; mo: number; d: number; time: string }

function wallClock(ms: number, zone: string): WallClock {
  return {
    y: Number(formatInTimeZone(ms, zone, "yyyy")),
    mo: Number(formatInTimeZone(ms, zone, "MM")),
    d: Number(formatInTimeZone(ms, zone, "dd")),
    time: formatInTimeZone(ms, zone, "HH:mm:ss"),
  }
}

function daysInMonth(year: number, month1: number) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

function addMonthsClamped(anchor: WallClock, months: number): WallClock {
  const total = anchor.mo - 1 + months
  const y = anchor.y + Math.floor(total / 12)
  const mo = (total % 12) + 1
  return { y, mo, d: Math.min(anchor.d, daysInMonth(y, mo)), time: anchor.time }
}

function wallKey(value: WallClock) {
  return `${value.y}-${pad2(value.mo)}-${pad2(value.d)}T${value.time}`
}

/**
 * Years, months and days since the anchor on the wall clock of the timer's zone.
 * Month steps clamp to month end, as milestones do (Jan 31 + 1 month = Feb 28).
 */
export function calendarElapsed(anchorIso: string, timezone: string, nowMs: number): CalendarElapsed | null {
  const anchorMs = new Date(anchorIso).getTime()
  if (!Number.isFinite(anchorMs) || anchorMs > nowMs) return null
  const zone = normalizeTimeZone(timezone)
  const anchor = wallClock(anchorMs, zone)
  const now = wallClock(nowMs, zone)

  let months = (now.y - anchor.y) * 12 + (now.mo - anchor.mo)
  while (months > 0 && wallKey(addMonthsClamped(anchor, months)) > wallKey(now)) months -= 1

  const base = addMonthsClamped(anchor, months)
  let days = Math.round((Date.UTC(now.y, now.mo - 1, now.d) - Date.UTC(base.y, base.mo - 1, base.d)) / DAY_MS)
  if (now.time < base.time) days -= 1

  return { years: Math.floor(months / 12), months: months % 12, days: Math.max(0, days) }
}

export type CalendarLead = {
  value: number
  unit: Extract<MilestoneUnit, "years" | "months">
  rest: string
}

/**
 * The calendar format leads with the largest whole unit: "3 years" then "6 months, 21 days".
 * A timer younger than one month has no calendar format (null).
 */
export function calendarLead(elapsed: CalendarElapsed | null): CalendarLead | null {
  if (!elapsed) return null
  const restParts = (parts: Array<[number, MilestoneUnit]>) =>
    parts
      .filter(([count]) => count > 0)
      .map(([count, unit]) => `${count} ${formatPluralMessage(`milestone.unit.${unit}`, count)}`)
      .join(", ")
  if (elapsed.years > 0) {
    return {
      value: elapsed.years,
      unit: "years",
      rest: restParts([
        [elapsed.months, "months"],
        [elapsed.days, "days"],
      ]),
    }
  }
  if (elapsed.months > 0) return { value: elapsed.months, unit: "months", rest: restParts([[elapsed.days, "days"]]) }
  return null
}

export type { CountUpFormat }

/** True when the counter itself already reads the reached milestone, so the corner stays empty. */
export function counterShowsMilestone(
  reached: Pick<MilestoneOccurrence, "count" | "unit">,
  format: CountUpFormat,
  totalDays: number,
  lead: CalendarLead | null,
) {
  if (format === "days" || !lead) return reached.unit === "days" && reached.count === totalDays
  return !lead.rest && lead.unit === reached.unit && lead.value === reached.count
}

import { formatInTimeZone } from "date-fns-tz"

import {
  countUpCalendarLead,
  countUpCalendarParts,
  effectiveCountUpFormat,
  type CountUpFormat,
} from "@/components/dashboard/count-up-format"
import { getActiveLocale } from "@/lib/i18n/active-locale"
import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import type { MilestoneOccurrence } from "@/lib/milestones"
import { timerHasNotifications } from "@/lib/timer-filters"
import { formatTimerReminderOffset } from "@/lib/timer-reminder-offset"
import { isSupportedTimeZone } from "@/lib/timezones"
import type { Timer } from "@/lib/types"

import { type DialReadout, type DialTimerView, type DialTrailItem, milestoneReachedToday } from "./dial-model"

// Words and dates for the dial view, in the active locale and the timer's own time zone.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

function zoneOf(timezone: string) {
  return isSupportedTimeZone(timezone) ? timezone : "UTC"
}

function dateFormat(zone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(getActiveLocale(), { timeZone: zone, ...options })
}

function dayKey(ms: number, zone: string) {
  return formatInTimeZone(ms, zone, "yyyy-MM-dd")
}

/** "Wed, Nov 11", with the year when it is not the current one. */
export function formatDialDate(ms: number, timezone: string, nowMs: number) {
  const zone = zoneOf(timezone)
  const sameYear = formatInTimeZone(ms, zone, "yyyy") === formatInTimeZone(nowMs, zone, "yyyy")
  return dateFormat(zone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(ms)
}

/** "16:00" */
export function formatDialTime(ms: number, timezone: string) {
  return dateFormat(zoneOf(timezone), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms)
}

/** "Wed" within the next six days, "Nov 20" further out. */
function formatShortDay(ms: number, timezone: string, nowMs: number) {
  const zone = zoneOf(timezone)
  if (ms - nowMs < 6 * DAY_MS) return dateFormat(zone, { weekday: "short" }).format(ms)
  return dateFormat(zone, { month: "short", day: "numeric" }).format(ms)
}

/** "today at 16:00", "tomorrow at 16:00", "Sun at 18:00" or "Nov 20 at 18:00". */
export function formatDialWhen(ms: number, timezone: string, nowMs: number) {
  const zone = zoneOf(timezone)
  const time = formatDialTime(ms, zone)
  const day = dayKey(ms, zone)
  if (day === dayKey(nowMs, zone)) return formatMessage("dial.when.today", { time })
  if (day === dayKey(nowMs + DAY_MS, zone)) return formatMessage("dial.when.tomorrow", { time })
  return formatMessage("dial.when.date", { date: formatShortDay(ms, zone, nowMs), time })
}

export type DialNumberPart = Readonly<{ text: string; group: boolean }>

/** The number in the active locale, split so the thousands separator can be drawn tighter. */
export function formatDialNumberParts(value: number): DialNumberPart[] {
  return new Intl.NumberFormat(getActiveLocale(), { maximumFractionDigits: 0 })
    .formatToParts(value)
    .map((part) => ({ text: part.value, group: part.type === "group" }))
}

export function formatDialNumber(value: number) {
  return new Intl.NumberFormat(getActiveLocale(), { maximumFractionDigits: 0 }).format(value)
}

// Dynamic plural keys: dial.unit.hours.one / dial.unit.hours.few / dial.unit.hours.many and
// timer.countdown.dayUnit.one / timer.countdown.dayUnit.few / timer.countdown.dayUnit.many.
export function formatDialUnit(readout: Pick<DialReadout, "unit" | "value">) {
  return formatPluralMessage(readout.unit === "days" ? "timer.countdown.dayUnit" : "dial.unit.hours", readout.value)
}

export type DialCount = Readonly<{
  value: number
  unit: string
  /** True when the number is the calendar lead (years or months), which never rolls by one. */
  calendar: boolean
}>

// Dynamic plural keys: milestone.unit.years.one / milestone.unit.months.one and their other forms.
/**
 * The number and unit in the middle of the dial. A count-up follows the count format chosen on
 * this device (the same one the card and the detail view use): total days or the calendar lead.
 */
export function dialCount(timer: Timer, view: DialTimerView, nowMs: number, format: CountUpFormat): DialCount {
  if (view.phase === "countUp" && view.readout.unit === "days") {
    const parts = countUpCalendarParts(timer.targetDate, timer.timezone, nowMs)
    if (effectiveCountUpFormat(format, parts) === "calendar") {
      const lead = countUpCalendarLead(parts)
      return { value: lead.value, unit: formatPluralMessage(`milestone.unit.${lead.unit}`, lead.value), calendar: true }
    }
  }
  return { value: view.readout.value, unit: formatDialUnit(view.readout), calendar: false }
}

// Dynamic plural keys: dial.duration.days.one / dial.duration.days.few / dial.duration.days.many,
// dial.duration.hours.one / dial.duration.hours.few / dial.duration.hours.many,
// dial.duration.minutes.one / dial.duration.minutes.few / dial.duration.minutes.many,
// dial.duration.seconds.one / dial.duration.seconds.few / dial.duration.seconds.many.
/** "161 days", "9 hours", "3 minutes": the largest unit that fits, rounded, never zero. */
export function formatDialDuration(ms: number) {
  const magnitude = Math.max(0, ms)
  const count = (unitMs: number) => Math.max(1, Math.round(magnitude / unitMs))
  if (magnitude >= DAY_MS) return formatPluralMessage("dial.duration.days", count(DAY_MS))
  if (magnitude >= HOUR_MS) return formatPluralMessage("dial.duration.hours", count(HOUR_MS))
  if (magnitude >= MINUTE_MS) return formatPluralMessage("dial.duration.minutes", count(MINUTE_MS))
  return formatPluralMessage("dial.duration.seconds", Math.max(1, Math.ceil(magnitude / 1_000)))
}

// Dynamic plural keys: milestone.unit.days.one / milestone.unit.days.many and the weeks,
// months and years forms.
/** "1,300 days", "4 years" */
export function formatMilestoneLabel(milestone: Pick<MilestoneOccurrence, "count" | "unit">) {
  return formatMessage("dial.milestone", {
    count: formatDialNumber(milestone.count),
    unit: formatPluralMessage(`milestone.unit.${milestone.unit}`, milestone.count),
  })
}

// Legend keys: iphone.legend.second / iphone.legend.minute / iphone.legend.hour /
// iphone.legend.day / iphone.legend.week.
/** The line under the dial: the tick unit, or the way to the next milestone. */
export function formatDialLegend(view: DialTimerView, nowMs: number) {
  if (view.scaleUnit) return formatMessage(`iphone.legend.${view.scaleUnit}`)
  const stretch = view.stretch
  if (!stretch || stretch.isMilestoneDay) return ""
  return formatMessage("dial.legend.toMilestone", {
    duration: formatDialDuration(stretch.endMs - nowMs),
    milestone: formatMilestoneLabel(stretch.next),
  })
}

// Cadence keys: dial.cadence.daily / dial.cadence.weekly / dial.cadence.monthly /
// dial.cadence.yearly.
function cadence(timer: Timer) {
  const type = timer.recurrence?.enabled ? timer.recurrence.type : null
  return type ? formatMessage(`dial.cadence.${type}`) : null
}

/** The short line under a row title. */
export function formatDialCaption(timer: Timer, view: DialTimerView, nowMs: number) {
  if (view.phase === "countUp") {
    if (milestoneReachedToday(timer, nowMs)) return formatMessage("dial.caption.milestoneToday")
    if (view.stretch) {
      return formatMessage("dial.caption.nextMilestone", {
        milestone: formatMilestoneLabel(view.stretch.next),
        duration: formatDialDuration(view.stretch.endMs - nowMs),
      })
    }
    return formatMessage("dial.caption.since", { date: formatDialDate(view.instantMs, timer.timezone, nowMs) })
  }
  if (view.phase === "passed") {
    return formatMessage("dial.caption.since", { date: formatDialDate(view.instantMs, timer.timezone, nowMs) })
  }
  const time = formatDialTime(view.instantMs, timer.timezone)
  const repeat = cadence(timer)
  if (repeat) {
    return formatMessage("dial.caption.repeat", {
      cadence: repeat,
      date: formatShortDay(view.instantMs, timer.timezone, nowMs),
      time,
    })
  }
  return formatMessage("dial.caption.date", { date: formatDialDate(view.instantMs, timer.timezone, nowMs), time })
}

/** The date line under the selected timer's title, with the time zone. */
export function formatDialDateLine(timer: Timer, view: DialTimerView, nowMs: number) {
  const zone = timer.timezone
  const date = formatDialDate(view.instantMs, zone, nowMs)
  const time = formatDialTime(view.instantMs, zone)
  if (view.phase !== "countdown") {
    return [formatMessage("dial.caption.since", { date }), time, zone].join(" · ")
  }
  const repeat = cadence(timer)
  return [repeat, date, time, zone].filter(Boolean).join(" · ")
}

/** The next reminder of a countdown, or null when none is ahead or notifications are off. */
export function formatDialReminder(timer: Timer, view: DialTimerView, nowMs: number) {
  if (view.phase !== "countdown" || timer.mode === "since") return null
  if (!timerHasNotifications(timer) || !timer.reminders?.length) return null
  const upcoming = timer.reminders
    .map((reminder) => ({ offset: reminder.offsetMinutes, atMs: view.instantMs - reminder.offsetMinutes * MINUTE_MS }))
    .filter((reminder) => reminder.atMs > nowMs)
    .sort((a, b) => a.atMs - b.atMs)[0]
  if (!upcoming) return null
  return formatMessage("dial.reminder", {
    when: formatDialWhen(upcoming.atMs, timer.timezone, nowMs),
    offset: formatTimerReminderOffset(upcoming.offset),
  })
}

/** The quiet second part of a milestone badge: "today", "in 100 days". */
export function formatTrailNote(item: DialTrailItem, nowMs: number) {
  if (item.today) return formatMessage("dial.trail.today")
  if (item.state === "reached") return ""
  return formatMessage("dial.trail.in", { duration: formatDialDuration(item.atMs - nowMs) })
}

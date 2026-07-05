import { clsx, type ClassValue } from "clsx"
import { fromZonedTime, formatInTimeZone } from "date-fns-tz"
import { twMerge } from "tailwind-merge"

import { isSupportedTimeZone, normalizeTimeZone } from "@/lib/timezones"
import type { Timer } from "@/lib/types"

type RecurrenceType = "daily" | "weekly" | "monthly" | "yearly"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type CountdownParts = {
  isCountUp: boolean
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
}

export function getCountdownParts(targetDateIsoUtc: string, nowMs: number): CountdownParts {
  const targetMs = new Date(targetDateIsoUtc).getTime()
  const deltaMs = targetMs - nowMs
  const isCountUp = deltaMs < 0
  const totalMs = Math.abs(deltaMs)

  const totalSeconds = Math.floor(totalMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return { isCountUp, days, hours, minutes, seconds, totalMs }
}

const TARGET_LINE_FORMAT = "MMM d, yyyy · HH:mm"

// Rendering stored data must never crash: an unparseable date yields null
// (callers skip the line), and a zone the current runtime's Intl rejects
// (date-fns-tz silently produces an invalid date for those) is formatted in
// UTC with an explicit marker instead.
export function formatTargetInTimeZone(targetDateIsoUtc: string, timezone: string): string | null {
  const target = new Date(targetDateIsoUtc)
  if (!Number.isFinite(target.getTime())) return null
  if (isSupportedTimeZone(timezone)) return formatInTimeZone(target, timezone, TARGET_LINE_FORMAT)
  return `${formatInTimeZone(target, "UTC", TARGET_LINE_FORMAT)} UTC`
}

export function wallClockToUtcIso(args: {
  date: string // YYYY-MM-DD
  time: string // HH:mm
  timezone: string
}): string {
  const { date, time, timezone } = args
  const dateTime = `${date}T${time}:00`
  const utcDate = fromZonedTime(dateTime, timezone)
  return utcDate.toISOString()
}

export function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

// ---- Slot-based recurrence (timezone-aware, RRULE-style) ----------------------
//
// A recurring timer is defined by a *slot* — a wall-clock pattern in the timer's
// timezone (time-of-day, plus weekday / day-of-month / month depending on the
// cadence). The slot is read from `targetDate` (the first occurrence), so the
// stored shape stays tiny. Occurrences are computed, never mutated, so the
// countdown is always correct regardless of when the app was last open.

export type RecurrenceSlot = {
  type: RecurrenceType
  time: string // "HH:mm" wall-clock in the timezone
  weekday: number // 0=Sun..6=Sat (weekly)
  dayOfMonth: number // 1..31 (monthly), also the day for yearly
  month: number // 0..11 (yearly)
  lastDay: boolean // monthly: fire on the last day of each month
}

function daysInMonth(year: number, month1: number): number {
  // month1 is 1..12; day 0 of the next month is the last day of this one
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

function weekdayOf(year: number, month1: number, day: number): number {
  return new Date(Date.UTC(year, month1 - 1, day)).getUTCDay()
}

function zonedYmd(ms: number, tz: string): { y: number; mo: number; d: number } {
  return {
    y: Number(formatInTimeZone(ms, tz, "yyyy")),
    mo: Number(formatInTimeZone(ms, tz, "MM")),
    d: Number(formatInTimeZone(ms, tz, "dd")),
  }
}

function slotInstantMs(y: number, mo: number, d: number, time: string, tz: string): number {
  return fromZonedTime(`${y}-${pad2(mo)}-${pad2(d)}T${time}:00`, tz).getTime()
}

function nextDailyOrWeeklyOccurrence(
  slot: RecurrenceSlot,
  tz: string,
  afterMs: number,
  start: { y: number; mo: number; d: number },
  cap: number,
): string | null {
  let { y, mo, d } = start
  for (let i = 0; i < cap; i++) {
    if (slot.type === "daily" || weekdayOf(y, mo, d) === slot.weekday) {
      const ms = slotInstantMs(y, mo, d, slot.time, tz)
      if (ms > afterMs) return new Date(ms).toISOString()
    }
    const proxy = new Date(Date.UTC(y, mo - 1, d))
    proxy.setUTCDate(proxy.getUTCDate() + 1)
    y = proxy.getUTCFullYear()
    mo = proxy.getUTCMonth() + 1
    d = proxy.getUTCDate()
  }
  return null
}

function nextMonthlyOccurrence(
  slot: RecurrenceSlot,
  tz: string,
  afterMs: number,
  start: { y: number; mo: number },
  cap: number,
): string | null {
  let y = start.y
  let mo = start.mo
  for (let i = 0; i < cap; i++) {
    const dim = daysInMonth(y, mo)
    const d = slot.lastDay ? dim : slot.dayOfMonth
    if (slot.lastDay || d <= dim) {
      const ms = slotInstantMs(y, mo, d, slot.time, tz)
      if (ms > afterMs) return new Date(ms).toISOString()
    }
    if (mo === 12) {
      mo = 1
      y += 1
    } else {
      mo += 1
    }
  }
  return null
}

function nextYearlyOccurrence(
  slot: RecurrenceSlot,
  tz: string,
  afterMs: number,
  startYear: number,
  cap: number,
): string | null {
  let y = startYear
  const mo = slot.month + 1
  for (let i = 0; i < cap; i++) {
    if (slot.dayOfMonth <= daysInMonth(y, mo)) {
      const ms = slotInstantMs(y, mo, slot.dayOfMonth, slot.time, tz)
      if (ms > afterMs) return new Date(ms).toISOString()
    }
    y += 1
  }
  return null
}

/** Read the recurrence slot from an anchor instant interpreted in `tz`. */
export function recurrenceSlot(anchorIso: string, type: RecurrenceType, tz: string, lastDay = false): RecurrenceSlot {
  const zone = normalizeTimeZone(tz)
  const anchorMs = new Date(anchorIso).getTime()
  const { y, mo, d } = zonedYmd(anchorMs, zone)
  return {
    type,
    time: formatInTimeZone(anchorMs, zone, "HH:mm"),
    weekday: weekdayOf(y, mo, d),
    dayOfMonth: d,
    month: mo - 1,
    lastDay,
  }
}

/**
 * The next occurrence of `slot` strictly after `afterMs`, resolved in `tz`.
 * Calendar stepping happens on wall-clock components (DST-independent); only the
 * final wall-clock -> UTC conversion is timezone-aware, so "weekly Mon 10:00"
 * stays at 10:00 local across DST changes. Slots that don't exist in a given
 * month/year (Feb 31, Feb 29 in common years) are skipped, matching iCal RRULE.
 */
export function nextSlotOccurrence(slot: RecurrenceSlot, tz: string, afterMs: number, cap = 800): string | null {
  // Zone support varies per runtime (see normalizeTimeZone): a browser that
  // cannot resolve the stored zone gets UTC wall-clock slots instead of a
  // crash. Servers run full ICU, so persisted schedules are unaffected.
  const zone = normalizeTimeZone(tz)
  const start = zonedYmd(afterMs, zone)

  if (slot.type === "daily" || slot.type === "weekly") {
    return nextDailyOrWeeklyOccurrence(slot, zone, afterMs, start, cap)
  }

  if (slot.type === "monthly") {
    return nextMonthlyOccurrence(slot, zone, afterMs, start, cap)
  }

  return nextYearlyOccurrence(slot, zone, afterMs, start.y, cap)
}

/**
 * The instant a recurring timer should currently count down to: the next slot
 * occurrence strictly after `nowMs` (never before the anchor). Non-recurring
 * timers just return their target. Nothing is mutated.
 */
export function effectiveTargetDate(timer: Timer, nowMs: number): string {
  if (!timer.recurrence?.enabled) return timer.targetDate
  const anchorMs = new Date(timer.targetDate).getTime()
  const slot = recurrenceSlot(timer.targetDate, timer.recurrence.type, timer.timezone, timer.recurrence.lastDay)
  const from = Math.max(nowMs, anchorMs - 1)
  return nextSlotOccurrence(slot, timer.timezone, from) ?? timer.targetDate
}

/**
 * The first `count` occurrences of a slot starting at `anchorIso` (inclusive),
 * for previewing a schedule the user is about to create.
 */
export function upcomingOccurrences(
  anchorIso: string,
  type: RecurrenceType,
  tz: string,
  count: number,
  lastDay = false,
): string[] {
  const slot = recurrenceSlot(anchorIso, type, tz, lastDay)
  const out: string[] = []
  let cursorMs = new Date(anchorIso).getTime() - 1
  for (let i = 0; i < count; i++) {
    const next = nextSlotOccurrence(slot, tz, cursorMs)
    if (!next) break
    out.push(next)
    cursorMs = new Date(next).getTime()
  }
  return out
}

/**
 * Derived history of a recurring timer: how many occurrences have elapsed since
 * the anchor (inclusive, up to `nowMs`) and the most recent one. Recomputed, not
 * stored. `cap` bounds the walk for very frequent long-running loops.
 */
export function recurrenceHistory(timer: Timer, nowMs: number, cap = 1000): { count: number; last: string | null } {
  if (!timer.recurrence?.enabled) return { count: 0, last: null }
  const anchorMs = new Date(timer.targetDate).getTime()
  if (anchorMs > nowMs) return { count: 0, last: null }

  const slot = recurrenceSlot(timer.targetDate, timer.recurrence.type, timer.timezone, timer.recurrence.lastDay)
  let count = 0
  let last: string | null = null
  let cursorMs = anchorMs - 1
  while (count < cap) {
    const next = nextSlotOccurrence(slot, timer.timezone, cursorMs)
    if (!next) break
    const ms = new Date(next).getTime()
    if (ms > nowMs) break
    count++
    last = next
    cursorMs = ms
  }
  return { count, last }
}

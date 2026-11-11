"use client"

import { useCallback, useSyncExternalStore } from "react"

import { calendarElapsed } from "@/components/dashboard/timer-insights"
import { getActiveLocale } from "@/lib/i18n/active-locale"
import { formatPluralMessage } from "@/lib/i18n/messages"
import { getCountdownParts } from "@/lib/utils"

// How a count-up's number reads on this device: total days ("1,300 days", the
// default) or years, months and days ("3 years, 6 months, 21 days"). It is a
// way of looking at the timer, not part of it, so it lives in local storage per
// timer and never syncs (same rule as the iPhone app). This is the one source
// for the card, the detail view and the dial: switching in one place shows
// everywhere, also across tabs.
export type CountUpFormat = "days" | "calendar"

export const COUNT_UP_FORMAT_STORAGE_PREFIX = "tickward:count-up-format:"
const CHANGE_EVENT = "tickward:count-up-format:change"

export function countUpFormatStorageKey(timerId: string) {
  return `${COUNT_UP_FORMAT_STORAGE_PREFIX}${timerId}`
}

export function readCountUpFormat(timerId: string): CountUpFormat {
  try {
    return globalThis.localStorage?.getItem(countUpFormatStorageKey(timerId)) === "calendar" ? "calendar" : "days"
  } catch {
    return "days"
  }
}

export function storeCountUpFormat(timerId: string, format: CountUpFormat) {
  if (globalThis.window === undefined) return
  try {
    // Days is the default; only the other choice takes a key.
    if (format === "days") globalThis.localStorage.removeItem(countUpFormatStorageKey(timerId))
    else globalThis.localStorage.setItem(countUpFormatStorageKey(timerId), format)
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this view only.
  }
  globalThis.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: timerId }))
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(COUNT_UP_FORMAT_STORAGE_PREFIX)) onChange()
  }
  globalThis.addEventListener("storage", onStorage)
  globalThis.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    globalThis.removeEventListener("storage", onStorage)
    globalThis.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function serverSnapshot(): CountUpFormat {
  return "days"
}

/** The stored format for one timer, with a setter and a toggle; every view of the timer stays in step. */
export function useCountUpFormat(timerId: string) {
  const format = useSyncExternalStore(subscribe, () => readCountUpFormat(timerId), serverSnapshot)
  const setFormat = useCallback((next: CountUpFormat) => storeCountUpFormat(timerId, next), [timerId])
  const toggle = useCallback(() => {
    storeCountUpFormat(timerId, readCountUpFormat(timerId) === "days" ? "calendar" : "days")
  }, [timerId])
  return [format, setFormat, toggle] as const
}

export type CountUpCalendarParts = {
  years: number
  months: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

const ZERO_PARTS: CountUpCalendarParts = { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 }

/**
 * Elapsed years, months and days on the timer's wall clock (month steps clamp to
 * month end, as milestones do), plus the running clock of the total elapsed time.
 */
export function countUpCalendarParts(anchorIso: string, timezone: string, nowMs: number): CountUpCalendarParts {
  const elapsed = calendarElapsed(anchorIso, timezone, nowMs)
  if (!elapsed) return { ...ZERO_PARTS }
  const clock = getCountdownParts(anchorIso, nowMs)
  return { ...elapsed, hours: clock.hours, minutes: clock.minutes, seconds: clock.seconds }
}

/**
 * The calendar format leads with the largest whole unit, so it only differs
 * from total days once a full month has passed. Under one month there is no
 * switch.
 */
export function countUpCalendarFormatAvailable(parts: CountUpCalendarParts) {
  return parts.years > 0 || parts.months > 0
}

export type CountUpCalendarLead = {
  value: number
  unit: "years" | "months" | "days"
  rest: Array<{ value: number; unit: "months" | "days" }>
}

/**
 * The big number and the smaller rest of the calendar format: 3 years with
 * "6 months, 21 days". An exact anniversary has no rest ("3 years").
 */
export function countUpCalendarLead(parts: CountUpCalendarParts): CountUpCalendarLead {
  if (parts.years > 0) {
    const rest: CountUpCalendarLead["rest"] = []
    if (parts.months > 0) rest.push({ value: parts.months, unit: "months" })
    if (parts.days > 0) rest.push({ value: parts.days, unit: "days" })
    return { value: parts.years, unit: "years", rest }
  }
  if (parts.months > 0) {
    return { value: parts.months, unit: "months", rest: parts.days > 0 ? [{ value: parts.days, unit: "days" }] : [] }
  }
  return { value: parts.days, unit: "days", rest: [] }
}

/** The format to render: the stored choice, or days when calendar parts do not apply yet. */
export function effectiveCountUpFormat(stored: CountUpFormat, parts: CountUpCalendarParts): CountUpFormat {
  return stored === "calendar" && countUpCalendarFormatAvailable(parts) ? "calendar" : "days"
}

// references: timer.countdown.dayUnit.one / milestone.unit.years.one / milestone.unit.months.one / milestone.unit.days.one
/**
 * The count as a screen reader hears it, without the running clock: "1,300 days"
 * or "3 years, 6 months, 21 days". The number is also the format switch, and a
 * button's label replaces its content, so the label has to start with this.
 */
export function spokenCountUp(format: CountUpFormat, totalDays: number, parts: CountUpCalendarParts) {
  const number = new Intl.NumberFormat(getActiveLocale(), { maximumFractionDigits: 0 })
  if (format === "days") {
    return `${number.format(totalDays)} ${formatPluralMessage("timer.countdown.dayUnit", totalDays)}`
  }
  const lead = countUpCalendarLead(parts)
  return [{ value: lead.value, unit: lead.unit }, ...lead.rest]
    .map((part) => `${number.format(part.value)} ${formatPluralMessage(`milestone.unit.${part.unit}`, part.value)}`)
    .join(", ")
}

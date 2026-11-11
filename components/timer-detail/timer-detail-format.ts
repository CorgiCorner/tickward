import { formatInTimeZone } from "date-fns-tz"

import { getActiveLocale } from "@/lib/i18n/active-locale"
import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import type { MilestoneOccurrence, MilestoneRule } from "@/lib/milestones"
import { normalizeTimeZone } from "@/lib/timezones"

// Date lines follow the app's existing English date patterns (see
// formatTargetInTimeZone); an unsupported zone degrades to UTC.

function validMs(value: number | string) {
  const ms = typeof value === "number" ? value : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** "Mon, Nov 16 · 18:00", with the year when it is not the current one. */
export function formatDetailDateTime(value: number | string, timezone: string, nowMs: number) {
  const ms = validMs(value)
  if (ms === null) return null
  const zone = normalizeTimeZone(timezone)
  const sameYear = formatInTimeZone(ms, zone, "yyyy") === formatInTimeZone(nowMs, zone, "yyyy")
  return formatInTimeZone(ms, zone, sameYear ? "EEE, MMM d · HH:mm" : "EEE, MMM d, yyyy · HH:mm")
}

/** "Tue, Apr 20, 2027" */
export function formatDetailDate(value: number | string, timezone: string) {
  const ms = validMs(value)
  if (ms === null) return null
  return formatInTimeZone(ms, normalizeTimeZone(timezone), "EEE, MMM d, yyyy")
}

/** "Nov 10, 2026" */
export function formatShortDate(value: number | string, timezone: string) {
  const ms = validMs(value)
  if (ms === null) return null
  return formatInTimeZone(ms, normalizeTimeZone(timezone), "MMM d, yyyy")
}

export function formatDetailNumber(value: number) {
  return new Intl.NumberFormat(getActiveLocale()).format(value)
}

// references: milestone.unit.days.one / milestone.unit.years.many
/** "1,400 days", "4 years" */
export function formatMilestoneAmount(milestone: Pick<MilestoneOccurrence, "count" | "unit">) {
  return `${formatDetailNumber(milestone.count)} ${formatPluralMessage(`milestone.unit.${milestone.unit}`, milestone.count)}`
}

/** "Every 100 days · Every year" style summary of a timer's milestone rules. */
export function formatMilestoneRules(rules: ReadonlyArray<MilestoneRule>) {
  return rules
    .map((rule) => {
      if ("every" in rule) {
        // references: timerDetail.milestones.everyOne.days / timerDetail.milestones.everyOne.weeks /
        // timerDetail.milestones.everyOne.months / timerDetail.milestones.everyOne.years
        if (rule.every === 1) return formatMessage(`timerDetail.milestones.everyOne.${rule.unit}`)
        return formatMessage("timerDetail.milestones.ruleEvery", {
          count: formatDetailNumber(rule.every),
          unit: formatPluralMessage(`milestone.unit.${rule.unit}`, rule.every),
        })
      }
      const last = rule.at.at(-1) ?? 0
      return formatMessage("timerDetail.milestones.ruleAt", {
        amounts: rule.at.map(formatDetailNumber).join(", "),
        unit: formatPluralMessage(`milestone.unit.${rule.unit}`, last),
      })
    })
    .join(" · ")
}

export function capitalizeFirst(value: string) {
  return value.length > 0 ? value.charAt(0).toLocaleUpperCase(getActiveLocale()) + value.slice(1) : value
}

// references: timerDetail.inDays.one / timerDetail.inDays.few / timerDetail.inDays.many
export function formatInDays(days: number) {
  return formatPluralMessage("timerDetail.inDays", days)
}

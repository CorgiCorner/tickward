import { differenceInDays, differenceInMonths, differenceInWeeks, differenceInYears } from "date-fns"

import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import type { MilestoneOccurrence } from "@/lib/milestones"
import { formatTargetInTimeZone } from "@/lib/utils"

// references: timer.display.nextMilestone / timer.display.lastMilestone
export function formatMilestoneDisplayLabel(kind: "next" | "last", milestone: MilestoneOccurrence, timezone: string) {
  return formatMessage(`timer.display.${kind}Milestone`, {
    count: milestone.count,
    unit: formatPluralMessage(`milestone.unit.${milestone.unit}`, milestone.count),
    date: formatTargetInTimeZone(milestone.at, timezone) ?? milestone.at,
  })
}

export function formatElapsedSince(anchorIso: string, nowMs: number): string | null {
  const anchor = new Date(anchorIso)
  const now = new Date(nowMs)
  if (!Number.isFinite(anchor.getTime()) || anchor.getTime() > nowMs) return null

  const candidates = [
    { count: differenceInYears(now, anchor), unit: "years" },
    { count: differenceInMonths(now, anchor), unit: "months" },
    { count: differenceInWeeks(now, anchor), unit: "weeks" },
    { count: differenceInDays(now, anchor), unit: "days" },
  ] as const
  const elapsed = candidates.find((candidate) => candidate.count >= 1) ?? { count: 0, unit: "days" as const }
  return `${elapsed.count} ${formatPluralMessage(`milestone.unit.${elapsed.unit}`, elapsed.count)}`
}

import { BellIcon, CheckIcon, FlagIcon } from "lucide-react"

import {
  formatMilestoneAmount,
  formatTimeUntil,
  formatUpcomingMoment,
  type MilestoneInsight,
  type NextReminder,
} from "@/components/dashboard/timer-insights"
import { formatMessage } from "@/lib/i18n/messages"
import { formatTimerReminderOffset } from "@/lib/timer-reminder-offset"
import type { MilestoneOccurrence } from "@/lib/milestones"
import { cn } from "@/lib/utils"

const lineClassName = "flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] leading-4 text-muted-foreground"

/** Countdown: the next reminder with a bell ("Reminder: 1 day before · today 16:00"). */
export function TimerReminderLine(
  props: Readonly<{ reminder: NextReminder; nowMs: number; timezone: string; compact?: boolean; className?: string }>,
) {
  const offset = formatTimerReminderOffset(props.reminder.offsetMinutes)
  const when = formatUpcomingMoment(props.reminder.atMs, props.nowMs, props.timezone)
  // The compact card has no room for the lead word; the bell says it.
  const label = props.compact ? `${offset} · ${when}` : formatMessage("timer.card.reminder", { offset, when })
  return (
    <div data-slot="timer-card-next" title={label} className={cn(lineClassName, props.className)}>
      <BellIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  )
}

function nextMilestoneWhen(next: MilestoneOccurrence, nowMs: number) {
  return formatTimeUntil(new Date(next.at).getTime(), nowMs)
}

/** Count-up: the next milestone, or the ladder's end. */
export function TimerMilestoneLine(
  props: Readonly<{
    insight: Exclude<MilestoneInsight, { kind: "reached" }>
    nowMs: number
    compact?: boolean
    className?: string
  }>,
) {
  let label = formatMessage("timer.display.ladderComplete")
  if (props.insight.kind === "next") {
    const amount = formatMilestoneAmount(props.insight.next)
    const lead = props.compact ? amount : formatMessage("timer.card.nextMilestone", { amount })
    label = `${lead} · ${nextMilestoneWhen(props.insight.next, props.nowMs)}`
  }
  return (
    <div data-slot="timer-card-next" title={label} className={cn(lineClassName, props.className)}>
      <FlagIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  )
}

/** Milestone day: the reached value in the rule's unit, quiet, in the text colour. */
export function TimerMilestoneReachedValue(
  props: Readonly<{ reached: MilestoneOccurrence; accent: string; className?: string }>,
) {
  return (
    <div
      data-slot="timer-card-reached"
      className={cn("flex items-center gap-1.5 whitespace-nowrap text-xs font-medium leading-4", props.className)}
    >
      <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" style={{ color: props.accent }} strokeWidth={2.5} />
      {formatMilestoneAmount(props.reached)}
    </div>
  )
}

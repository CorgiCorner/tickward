"use client"

import type { ComponentProps, ReactNode } from "react"

import { CARD_PRESS_CLASSNAME } from "@/components/dashboard/motion"
import { countdownSegments } from "@/components/dashboard/timer-insights"
import type { MilestoneMomentPhase } from "@/components/dashboard/use-milestone-moment"
import {
  GroupedDigits,
  MilestoneProgressBar,
  MilestoneReachedBadge,
  MilestoneRoll,
  milestoneTint,
  previousDayValue,
  TimerFocusDesktopAction,
  TimerNotificationStateIcon,
  TimerOverflowActions,
  TimerProgressBar,
  TimerRecurrenceBadge,
  TimerSinceBadge,
  TimerSpaceDot,
} from "@/components/timer-card-parts"
import { useNow } from "@/components/use-now"
import { formatMessage } from "@/lib/i18n/messages"
import type { Space, Timer } from "@/lib/types"
import { cn, getCountdownParts } from "@/lib/utils"

type RecurrenceHistory = { count: number; last: string | null }

function CompactCounter(props: Readonly<{ targetDateIsoUtc: string; rollPhase?: MilestoneMomentPhase }>) {
  const nowMs = useNow()
  const segments = countdownSegments(getCountdownParts(props.targetDateIsoUtc, nowMs))
  const from = props.rollPhase ? previousDayValue(props.targetDateIsoUtc, nowMs) : undefined
  return (
    <div data-slot="timer-card-counter" className="flex min-w-0 items-baseline gap-2.5 font-mono tabular-nums">
      {segments.map((segment) => (
        <span key={segment.key} className="flex items-baseline gap-[3px]">
          <span
            className={cn("text-[28px] font-medium leading-none", segment.muted ? "opacity-45" : "")}
            suppressHydrationWarning
          >
            <MilestoneRoll
              value={<GroupedDigits value={segment.value} />}
              from={segment.key === "days" && from !== undefined ? <GroupedDigits value={from} /> : undefined}
              phase={props.rollPhase}
            />
          </span>
          <span className="text-[10px] tracking-[0.08em] text-muted-foreground">{segment.label}</span>
        </span>
      ))}
    </div>
  )
}

function CompactProgress(props: Readonly<{ timer: Timer; effectiveTarget: string; history: RecurrenceHistory }>) {
  const nowMs = useNow()
  return (
    <TimerProgressBar
      timer={props.timer}
      effectiveTarget={props.effectiveTarget}
      nowMs={nowMs}
      history={props.history}
    />
  )
}

/**
 * The dense desktop card for the grid view: about 100 px tall, 28 px digits with
 * their units inline, the date always visible, and what comes next on the right.
 * The full card stays in the list view and on phones.
 */
export function CompactTimerCardContent(
  props: Readonly<{
    timer: Timer
    effectiveTarget: string
    nowMs: number
    sub: string
    isArchived: boolean
    isPinned: boolean
    isRecurring: boolean
    history: RecurrenceHistory
    space?: Space
    dragHandle?: ReactNode
    insight?: ReactNode
    milestoneDay?: { accent: string; phase: MilestoneMomentPhase; rolling?: boolean; onReplay: () => void }
    milestoneProgress?: { value: number; accent: string; phase: MilestoneMomentPhase }
    /** Covers the card and opens its detail view; card controls stack above it. */
    detailOpener?: ReactNode
    onOpenFocus: () => void
    onTogglePin: () => void
    menu: Omit<ComponentProps<typeof TimerOverflowActions>, "pin">
  }>,
) {
  const countUp = props.timer.mode === "since" || getCountdownParts(props.effectiveTarget, props.nowMs).isCountUp

  return (
    <article
      data-slot="compact-timer-card"
      data-milestone-day={props.milestoneDay ? "" : undefined}
      className={cn(
        "relative flex h-full min-w-0 flex-col justify-between gap-2.5 overflow-hidden rounded-[12px] border border-border bg-card px-3.5 pb-4 pt-3",
        CARD_PRESS_CLASSNAME,
        props.isArchived ? "bg-card/70 text-muted-foreground" : "",
      )}
      style={props.milestoneDay && !props.isArchived ? milestoneTint(props.milestoneDay.accent) : undefined}
    >
      {props.detailOpener}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="flex min-w-0 items-center gap-1.5">
            {props.dragHandle}
            <TimerSpaceDot timer={props.timer} space={props.space} />
            <h4 className="truncate text-sm font-semibold">{props.timer.label}</h4>
            {props.isRecurring ? <TimerRecurrenceBadge timer={props.timer} history={props.history} /> : null}
            {!props.isRecurring && countUp ? <TimerSinceBadge /> : null}
            <TimerNotificationStateIcon timer={props.timer} />
            {props.isArchived ? (
              <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
                {formatMessage("timer.recurrence.archived")}
              </span>
            ) : null}
            {props.milestoneDay ? (
              <MilestoneReachedBadge
                accent={props.milestoneDay.accent}
                phase={props.milestoneDay.phase}
                onReplay={props.milestoneDay.onReplay}
                className="origin-left px-2 py-0 text-[11px]"
              />
            ) : null}
          </div>
          <p data-slot="timer-card-date" className="truncate text-[11px] leading-4 text-muted-foreground">
            {props.sub}
          </p>
        </div>
        <div
          data-timer-card-action=""
          className="relative z-10 -mr-1.5 -mt-1 flex shrink-0 items-center text-muted-foreground"
        >
          <TimerFocusDesktopAction onOpenFocus={props.onOpenFocus} />
          <TimerOverflowActions {...props.menu} pin={{ isPinned: props.isPinned, onTogglePin: props.onTogglePin }} />
        </div>
      </div>
      {/* What comes next sits beside the count when the card is wide enough and wraps under
          it, right-aligned, when it is not, so it is never cut short. */}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <CompactCounter
          targetDateIsoUtc={props.effectiveTarget}
          rollPhase={props.isArchived || !props.milestoneDay?.rolling ? undefined : props.milestoneDay.phase}
        />
        {props.insight ? (
          <div data-slot="compact-timer-card-insight" className="ml-auto max-w-full pb-0.5">
            {props.insight}
          </div>
        ) : null}
      </div>
      {props.milestoneProgress ? (
        <MilestoneProgressBar
          value={props.milestoneProgress.value}
          accent={props.milestoneProgress.accent}
          phase={props.milestoneProgress.phase}
        />
      ) : (
        <CompactProgress timer={props.timer} effectiveTarget={props.effectiveTarget} history={props.history} />
      )}
    </article>
  )
}

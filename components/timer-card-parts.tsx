import {
  ArrowUpIcon,
  BellOffIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  FlagIcon,
  PinIcon,
  RepeatIcon,
} from "lucide-react"
import Image from "next/image"
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react"

import { countUpCalendarParts, spokenCountUp } from "@/components/dashboard/count-up-format"
import {
  calendarElapsed,
  calendarLead,
  countdownSegments,
  type CountUpFormat,
} from "@/components/dashboard/timer-insights"
import type { MilestoneMomentPhase } from "@/components/dashboard/use-milestone-moment"
import {
  canAnimate,
  CARD_PRESS_CLASSNAME,
  MENU_MOTION_CLASSNAME,
  MOTION_MS,
  MOVE_EASING,
  PRESS_CLASSNAME,
  prefersReducedMotion,
} from "@/components/dashboard/motion"
import { TimerFocusAction } from "@/components/timer-focus-action"
import { useNow } from "@/components/use-now"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import { timerNotificationsEnabled } from "@/lib/notification-preferences"
import type { Space, Timer } from "@/lib/types"
import { cn, formatTargetInTimeZone, getCountdownParts, pad2 } from "@/lib/utils"

type RecurrenceHistory = {
  count: number
  last: string | null
}

const timerActionClassName = cn(
  "text-muted-foreground/75 transition-[color,background-color,scale] hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
  PRESS_CLASSNAME,
)

type StopPropagationEvent = {
  stopPropagation: () => void
}

/** Manual order only: move the card one place within its section. */
export type TimerReorderActions = {
  onMoveEarlier?: () => void
  onMoveLater?: () => void
}

function timerAccentColor(timer: Timer, space: Space | undefined) {
  return timer.color || space?.color
}

function notificationEnabled(timer: Timer) {
  return timerNotificationsEnabled(timer.notification, timer.notify)
}

function recurrenceTypeLabel(type: NonNullable<Timer["recurrence"]>["type"]) {
  if (type === "daily") return formatMessage("timer.form.recurrence.daily")
  if (type === "weekly") return formatMessage("timer.form.recurrence.weekly")
  if (type === "monthly") return formatMessage("timer.form.recurrence.monthly")
  return formatMessage("timer.form.recurrence.yearly")
}

export function TimerSpaceDot(props: Readonly<{ timer: Timer; space?: Space }>) {
  const accent = timerAccentColor(props.timer, props.space)

  return (
    <span
      className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
      style={accent ? { backgroundColor: accent } : undefined}
    />
  )
}

export function TimerRecurrenceBadge(props: Readonly<{ timer: Timer; history: RecurrenceHistory }>) {
  const recurrence = props.timer.recurrence
  if (!recurrence?.enabled) return null

  const type = recurrenceTypeLabel(recurrence.type).toLowerCase()
  const label =
    props.history.count > 0 ? formatMessage("timer.recurrence.badge", { type, count: props.history.count }) : type

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
          <RepeatIcon className="size-2.5" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {props.history.count > 0 && props.history.last
          ? formatMessage("timer.recurrence.history", {
              count: props.history.count,
              last: formatTargetInTimeZone(props.history.last, props.timer.timezone) ?? props.history.last,
            })
          : formatMessage("timer.recurrence.nextShown")}
      </TooltipContent>
    </Tooltip>
  )
}

export function TimerNotificationStateIcon(props: Readonly<{ timer: Timer }>) {
  if (notificationEnabled(props.timer)) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <BellOffIcon
          aria-label={formatMessage("timer.notificationsOff")}
          className="size-3 shrink-0 text-muted-foreground/60"
        />
      </TooltipTrigger>
      <TooltipContent>{formatMessage("timer.notificationsOff")}</TooltipContent>
    </Tooltip>
  )
}

export function TimerSinceBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
      {formatMessage("timer.countdown.since")}
    </span>
  )
}

// Mono digits spread a thousands separator over a full cell; pulling it in keeps
// "1,300" reading as one number.
export function GroupedDigits(props: Readonly<{ value: string }>) {
  const pieces = props.value.split(/(\D)/)
  if (pieces.length === 1) return <>{props.value}</>
  return (
    <>
      {pieces.map((piece, index) =>
        /\D/.test(piece) ? (
          <span key={index} data-slot="digit-separator" className="-mx-[0.17em]">
            {piece}
          </span>
        ) : (
          piece
        ),
      )}
    </>
  )
}

const DAY_MS = 86_400_000

// The milestone moment on a card, about half a second: the count rolls (260 ms), the bar
// closes (260 ms), then the badge and the reached value arrive (220 ms, 160 ms in).
const ROLL_LAYER = "col-start-1 row-start-1 transition-[translate,opacity] duration-move ease-move"
const ARRIVE_DELAY = "delay-[160ms]"

/**
 * The count on a milestone day: yesterday's number rolls up and out while today's rolls in
 * from below. Without `from` it is just the value. With reduced motion only the fade stays.
 */
export function MilestoneRoll(
  props: Readonly<{ value: ReactNode; from?: ReactNode; phase?: MilestoneMomentPhase }>,
) {
  if (props.from === undefined || props.phase === undefined) return <>{props.value}</>
  const done = props.phase === "done"
  return (
    // The numbers roll through a window one line tall, like an odometer.
    <span data-slot="milestone-roll" data-phase={props.phase} className="-my-[0.1em] inline-grid overflow-hidden py-[0.1em]">
      <span
        className={cn(
          ROLL_LAYER,
          done ? "translate-y-0 opacity-100" : "translate-y-[calc(0.5em*var(--motion-travel))] opacity-0 transition-none",
        )}
      >
        {props.value}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          ROLL_LAYER,
          done ? "-translate-y-[calc(0.5em*var(--motion-travel))] opacity-0" : "translate-y-0 opacity-100 transition-none",
        )}
      >
        {props.from}
      </span>
    </span>
  )
}

function HeroCountdownUnit(
  props: Readonly<{
    value: ReactNode
    label: string
    muted?: boolean
  }>,
) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={cn(
          "text-[40px] font-medium leading-none tracking-normal",
          props.muted ? "text-muted-foreground/55" : "",
        )}
        suppressHydrationWarning
      >
        {props.value}
      </span>
      <span className="mt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{props.label}</span>
    </div>
  )
}

function HeroCountdownSeparator() {
  return <span className="flex h-[40px] items-center text-xl leading-none text-muted-foreground/35">:</span>
}

/** Yesterday's day count, for the milestone roll. */
export function previousDayValue(targetDateIsoUtc: string, nowMs: number) {
  const days = getCountdownParts(targetDateIsoUtc, nowMs - DAY_MS).days
  return countdownSegments({ days, hours: 0, minutes: 0, seconds: 0 }).find((segment) => segment.key === "days")?.value
}

function HeroCountdown(
  props: Readonly<{ targetDateIsoUtc: string; nowMs: number; rollPhase?: MilestoneMomentPhase }>,
) {
  const parts = getCountdownParts(props.targetDateIsoUtc, props.nowMs)
  const segments = countdownSegments(parts)
  const from = props.rollPhase ? previousDayValue(props.targetDateIsoUtc, props.nowMs) : undefined

  return (
    <div data-slot="timer-card-counter" className="flex items-start gap-1.5 font-mono tabular-nums">
      {segments.map((segment, index) => (
        <span key={segment.key} className="contents">
          {index > 0 ? <HeroCountdownSeparator /> : null}
          <HeroCountdownUnit
            value={
              <MilestoneRoll
                value={<GroupedDigits value={segment.value} />}
                from={segment.key === "days" && from !== undefined ? <GroupedDigits value={from} /> : undefined}
                phase={props.rollPhase}
              />
            }
            label={segment.label}
            muted={segment.muted}
          />
        </span>
      ))}
    </div>
  )
}

// Two stacked layers that cross-fade; the hidden one keeps its size so the card
// does not jump when the format switches.
function counterLayerClassName(shown: boolean) {
  return cn(
    "col-start-1 row-start-1 transition-[opacity,filter] ease-fade motion-reduce:blur-none",
    shown ? "opacity-100 blur-none duration-enter" : "pointer-events-none opacity-0 blur-[4px] duration-exit",
  )
}

function CountUpCalendarLayer(
  props: Readonly<{
    value: number
    /** Yesterday's lead value, when it was different: it rolls into today's. */
    from?: number
    rollPhase?: MilestoneMomentPhase
    unit: "years" | "months"
    rest: string
    hours: number
    minutes: number
    seconds: number
  }>,
) {
  return (
    <span className="flex flex-col items-start">
      <span className="flex items-baseline gap-2.5">
        <span
          className="font-mono text-[40px] font-medium leading-none tracking-normal tabular-nums"
          suppressHydrationWarning
        >
          <MilestoneRoll value={props.value} from={props.from} phase={props.rollPhase} />
        </span>
        <span className="text-[22px] font-medium leading-none tracking-[-0.01em]">
          {formatPluralMessage(`milestone.unit.${props.unit}`, props.value)}
        </span>
      </span>
      <span className="mt-2 flex items-baseline gap-3 text-[13px] leading-[15px]">
        {props.rest ? <span className="whitespace-nowrap text-foreground/80">{props.rest}</span> : null}
        <span
          className="font-mono text-xs tracking-[0.04em] text-muted-foreground tabular-nums"
          suppressHydrationWarning
        >
          {pad2(props.hours)}:{pad2(props.minutes)}:{pad2(props.seconds)}
        </span>
      </span>
    </span>
  )
}

function previousLeadValue(
  anchorIso: string,
  timezone: string,
  nowMs: number,
  lead: NonNullable<ReturnType<typeof calendarLead>>,
) {
  const yesterday = calendarLead(calendarElapsed(anchorIso, timezone, nowMs - DAY_MS))
  return yesterday && yesterday.unit === lead.unit && yesterday.value !== lead.value ? yesterday.value : undefined
}

/**
 * A count-up's number in total days (default) or years, months and days. The
 * number itself is the switch; a timer younger than one month has no switch.
 */
function CountUpCounter(
  props: Readonly<{
    anchorIso: string
    timezone: string
    nowMs: number
    format: CountUpFormat
    onToggleFormat?: () => void
    rollPhase?: MilestoneMomentPhase
  }>,
) {
  const parts = getCountdownParts(props.anchorIso, props.nowMs)
  const lead = calendarLead(calendarElapsed(props.anchorIso, props.timezone, props.nowMs))
  const days = <HeroCountdown targetDateIsoUtc={props.anchorIso} nowMs={props.nowMs} rollPhase={props.rollPhase} />
  if (!lead || !props.onToggleFormat) return days

  const calendar = props.format === "calendar"
  const label = formatMessage(calendar ? "timer.card.showTotalDays" : "timer.card.showCalendarFormat")
  const spoken = spokenCountUp(
    props.format,
    parts.days,
    countUpCalendarParts(props.anchorIso, props.timezone, props.nowMs),
  )
  return (
    <button
      type="button"
      data-timer-card-action=""
      data-slot="count-up-format-toggle"
      data-format={props.format}
      aria-label={`${spoken}. ${label}`}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        props.onToggleFormat?.()
      }}
      className="relative z-10 grid cursor-pointer justify-items-start rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span aria-hidden={calendar} className={counterLayerClassName(!calendar)}>
        {days}
      </span>
      <span aria-hidden={!calendar} className={counterLayerClassName(calendar)}>
        <CountUpCalendarLayer
          value={lead.value}
          from={props.rollPhase ? previousLeadValue(props.anchorIso, props.timezone, props.nowMs, lead) : undefined}
          rollPhase={props.rollPhase}
          unit={lead.unit}
          rest={lead.rest}
          hours={parts.hours}
          minutes={parts.minutes}
          seconds={parts.seconds}
        />
      </span>
    </button>
  )
}

export function milestoneTint(accent: string): CSSProperties {
  return {
    borderColor: `color-mix(in oklab, ${accent} 55%, var(--border))`,
    backgroundColor: `color-mix(in oklab, ${accent} 5%, var(--card))`,
  }
}

/** "Milestone reached": tinted with the timer colour, text in the text colour, no value. */
export function MilestoneReachedBadge(
  props: Readonly<{ accent: string; phase: MilestoneMomentPhase; onReplay: () => void; className?: string }>,
) {
  const label = formatMessage("timer.card.replayMilestone")
  return (
    <button
      type="button"
      data-timer-card-action=""
      data-slot="milestone-reached-badge"
      aria-label={`${formatMessage("timer.card.milestoneReached")}. ${label}`}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        props.onReplay()
      }}
      className={cn(
        "relative z-10 inline-flex shrink-0 origin-right items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold leading-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:scale-100",
        props.phase === "done"
          ? `scale-100 opacity-100 transition-[opacity,scale] duration-enter ease-move ${ARRIVE_DELAY}`
          : "scale-95 opacity-0 transition-none",
        props.className,
      )}
      style={{
        borderColor: `color-mix(in oklab, ${props.accent} 45%, var(--border))`,
        backgroundColor: `color-mix(in oklab, ${props.accent} 12%, var(--card))`,
      }}
    >
      <FlagIcon aria-hidden="true" className="size-3" style={{ color: props.accent }} strokeWidth={2.5} />
      {formatMessage("timer.card.milestoneReached")}
    </button>
  )
}

/** Count-up progress towards the next milestone, built into the bottom border. */
export function MilestoneProgressBar(props: Readonly<{ value: number; accent: string; phase: MilestoneMomentPhase }>) {
  // The bar closes during the moment: from where it stood the day before, near the end.
  const value = props.phase === "done" ? props.value : Math.min(props.value, 0.94)
  return (
    <div data-slot="milestone-progress" className="absolute inset-x-0 bottom-0 h-[3px] bg-border">
      <div
        className={cn(
          "h-full origin-left",
          props.phase === "done"
            ? "transition-transform duration-move ease-move motion-reduce:transition-none"
            : "transition-none",
        )}
        style={{ backgroundColor: props.accent, transform: `scaleX(${value})` }}
      />
    </div>
  )
}

export function TimerProgressBar(
  props: Readonly<{
    timer: Timer
    effectiveTarget: string
    nowMs: number
    history: RecurrenceHistory
  }>,
) {
  const parts = getCountdownParts(props.effectiveTarget, props.nowMs)
  if (parts.isCountUp) return null

  const cycleStart = props.timer.recurrence?.enabled && props.history.last ? props.history.last : props.timer.createdAt
  const startedAt = new Date(cycleStart).getTime()
  const targetAt = new Date(props.effectiveTarget).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(targetAt) || targetAt <= startedAt) return null

  const rawProgress = ((props.nowMs - startedAt) / (targetAt - startedAt)) * 100
  const progress = Math.max(0, Math.min(100, rawProgress))
  const startIso = new Date(startedAt).toISOString()
  const startDate = formatTargetInTimeZone(startIso, props.timer.timezone) ?? startIso
  const targetDate = formatTargetInTimeZone(props.effectiveTarget, props.timer.timezone) ?? props.effectiveTarget

  const startMessage = formatMessage("timer.progress.start", { date: startDate })
  const targetMessage = formatMessage("timer.progress.target", { date: targetDate })

  // The progress is built into the card's bottom border: a thin strip flush on the
  // bottom edge, clipped to the rounded bottom corners (rounded-b matches the card's
  // inner radius). The track is the border colour, the blue fill is elapsed time.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="img"
          aria-label={`${startMessage} · ${targetMessage}`}
          className="absolute inset-x-0 bottom-0 h-[3px] bg-border"
        >
          <div className="h-full bg-blue-600 dark:bg-blue-500" style={{ width: `${progress}%` }} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        {startMessage} → {targetMessage}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerLiveCountdown(
  props: Readonly<{
    timer: Timer
    effectiveTarget: string
    history: RecurrenceHistory
    insight?: ReactNode
    countUpFormat?: CountUpFormat
    onToggleCountUpFormat?: () => void
    rollPhase?: MilestoneMomentPhase
  }>,
) {
  const nowMs = useNow()
  const countUp = props.timer.mode === "since"

  return (
    <>
      <div className="mt-4 flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 overflow-x-auto pb-1">
          {countUp ? (
            <CountUpCounter
              anchorIso={props.effectiveTarget}
              timezone={props.timer.timezone}
              nowMs={nowMs}
              format={props.countUpFormat ?? "days"}
              onToggleFormat={props.onToggleCountUpFormat}
              rollPhase={props.rollPhase}
            />
          ) : (
            <HeroCountdown targetDateIsoUtc={props.effectiveTarget} nowMs={nowMs} />
          )}
        </div>
        {props.insight ? <div className="min-w-0 max-w-full pb-1 sm:mb-[22px] sm:pb-0">{props.insight}</div> : null}
      </div>
      <TimerProgressBar
        timer={props.timer}
        effectiveTarget={props.effectiveTarget}
        nowMs={nowMs}
        history={props.history}
      />
    </>
  )
}

export function TimerCardContent(
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
    countUpFormat?: CountUpFormat
    onToggleCountUpFormat?: () => void
    milestoneDay?: { accent: string; phase: MilestoneMomentPhase; rolling?: boolean; onReplay: () => void }
    milestoneProgress?: { value: number; accent: string; phase: MilestoneMomentPhase }
    mobileActions: ReactNode
    desktopActions: ReactNode
    /** Covers the card and opens its detail view; card controls stack above it. */
    detailOpener?: ReactNode
    nowCountingUp?: boolean
    countUpBadgeLabel?: string
    countUpExpiresAt?: number | null
    countUpPrimaryLabel?: string
    countUpPrimaryDescription?: string
    onCountUpPrimary?: () => void
    onDeferCountUp?: (durationMs: number | null) => void
    onCountUpMenuOpenChange?: (open: boolean) => void
  }>,
) {
  const countUpPrimaryDescriptionId = useId()
  const countUpPrimaryAction =
    props.onCountUpPrimary && props.countUpPrimaryLabel ? (
      <DropdownMenu onOpenChange={props.onCountUpMenuOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                data-timer-card-action=""
                className="relative z-10 h-[18px] shrink-0 gap-0.5 rounded border border-border px-1.5 py-0 text-[9px] font-semibold leading-none"
                aria-label={props.countUpPrimaryLabel}
                aria-describedby={props.countUpPrimaryDescription ? countUpPrimaryDescriptionId : undefined}
              >
                <CheckIcon aria-hidden="true" className="size-2.5" />
                {props.countUpPrimaryLabel}
                <ChevronDownIcon aria-hidden="true" className="size-2.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent id={countUpPrimaryDescriptionId} side="top" className="max-w-64 text-center">
            {props.countUpPrimaryDescription ?? props.countUpPrimaryLabel}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" sideOffset={4} className={MENU_MOTION_CLASSNAME}>
          <DropdownMenuItem onSelect={props.onCountUpPrimary}>
            <CheckIcon aria-hidden="true" className="size-3.5" />
            {props.countUpPrimaryLabel}
          </DropdownMenuItem>
          {props.onDeferCountUp ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{formatMessage("countUp.acknowledgeLater")}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => props.onDeferCountUp?.(15 * 60 * 1000)}>
                {formatMessage("countUp.keep15m")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onDeferCountUp?.(60 * 60 * 1000)}>
                {formatMessage("countUp.keep1h")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onDeferCountUp?.(24 * 60 * 60 * 1000)}>
                {formatMessage("countUp.keep1d")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onDeferCountUp?.(null)}>
                {formatMessage("countUp.keepUntilAcknowledged")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null
  const countUpScheduledStatus =
    props.countUpExpiresAt !== null && props.countUpExpiresAt !== undefined ? (
      <CountUpScheduledStatus expiresAt={props.countUpExpiresAt} />
    ) : null

  return (
    <article
      className={cn(
        // overflow-hidden lets the card clip the bottom-border progress strip to its
        // own rounded corners (a 3px strip can't reproduce the 12px corner itself).
        "group relative min-w-0 w-full overflow-hidden rounded-[12px] border border-border bg-card px-4 pb-6 pt-4",
        CARD_PRESS_CLASSNAME,
        props.isArchived ? "bg-card/70 text-muted-foreground" : "",
        props.nowCountingUp ? "border-muted-foreground/30 bg-muted/25" : "",
      )}
      data-milestone-day={props.milestoneDay ? "" : undefined}
      style={props.milestoneDay && !props.isArchived ? milestoneTint(props.milestoneDay.accent) : undefined}
    >
      {props.detailOpener}
      {props.mobileActions}

      <div className="flex min-w-0 items-start justify-between gap-3">
        <TimerCardTitleBlock
          timer={props.timer}
          effectiveTarget={props.effectiveTarget}
          nowMs={props.nowMs}
          sub={props.sub}
          isArchived={props.isArchived}
          isRecurring={props.isRecurring}
          history={props.history}
          space={props.space}
          dragHandle={props.dragHandle}
          nowCountingUp={props.nowCountingUp}
          countUpBadgeLabel={props.countUpBadgeLabel}
          countUpPrimaryAction={countUpPrimaryAction}
          countUpScheduledStatus={countUpScheduledStatus}
          milestoneBadge={
            props.milestoneDay ? (
              <MilestoneReachedBadge
                accent={props.milestoneDay.accent}
                phase={props.milestoneDay.phase}
                onReplay={props.milestoneDay.onReplay}
                className="md:hidden"
              />
            ) : null
          }
        />
        <div data-timer-card-action="" className="relative z-10 hidden shrink-0 items-center gap-2 md:flex">
          {props.milestoneDay ? (
            <MilestoneReachedBadge
              accent={props.milestoneDay.accent}
              phase={props.milestoneDay.phase}
              onReplay={props.milestoneDay.onReplay}
            />
          ) : null}
          {props.desktopActions}
        </div>
      </div>

      <TimerLiveCountdown
        timer={props.timer}
        effectiveTarget={props.effectiveTarget}
        history={props.history}
        insight={props.insight}
        countUpFormat={props.countUpFormat}
        onToggleCountUpFormat={props.onToggleCountUpFormat}
        rollPhase={props.isArchived || !props.milestoneDay?.rolling ? undefined : props.milestoneDay.phase}
      />
      {props.milestoneProgress ? (
        <MilestoneProgressBar
          value={props.milestoneProgress.value}
          accent={props.milestoneProgress.accent}
          phase={props.milestoneProgress.phase}
        />
      ) : null}
    </article>
  )
}

function CountUpScheduledStatus(props: Readonly<{ expiresAt: number }>) {
  const descriptionId = useId()
  const liveNowMs = useNow()

  if (props.expiresAt <= liveNowMs) return null

  const label = formatMessage("countUp.scheduledInMinutes", {
    minutes: Math.max(1, Math.ceil((props.expiresAt - liveNowMs) / 60_000)),
  })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="relative z-10 inline-flex size-[18px] shrink-0 items-center justify-center rounded border border-border text-muted-foreground"
          role="img"
          tabIndex={0}
          aria-label={label}
          aria-describedby={descriptionId}
          data-count-up-scheduled=""
        >
          <ClockIcon aria-hidden="true" className="size-2.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent id={descriptionId} side="top" className="max-w-64 text-center">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerCardTitleBlock(
  props: Readonly<{
    timer: Timer
    effectiveTarget: string
    nowMs: number
    sub: string
    isArchived: boolean
    isRecurring: boolean
    history: RecurrenceHistory
    space?: Space
    dragHandle?: ReactNode
    nowCountingUp?: boolean
    countUpBadgeLabel?: string
    countUpPrimaryAction?: ReactNode
    countUpScheduledStatus?: ReactNode
    milestoneBadge?: ReactNode
  }>,
) {
  const parts = getCountdownParts(props.effectiveTarget, props.nowMs)

  return (
    <div className="flex min-w-0 items-start gap-2 pr-24 md:pr-0">
      {props.timer.image ? (
        <Image
          src={props.timer.image.thumbUrl}
          alt=""
          width={36}
          height={36}
          unoptimized
          className="size-9 shrink-0 rounded-lg object-cover"
        />
      ) : null}
      <div className={cn("min-w-0", props.isArchived ? "text-muted-foreground" : "")}>
        <div className="flex min-w-0 items-center gap-1.5">
          {props.dragHandle}
          <TimerSpaceDot timer={props.timer} space={props.space} />
          <h4 className="truncate text-sm font-semibold tracking-normal">{props.timer.label}</h4>
          {props.isRecurring ? <TimerRecurrenceBadge timer={props.timer} history={props.history} /> : null}
          {props.nowCountingUp ? (
            <>
              <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded border border-border bg-muted px-1.5 py-0 text-[9px] font-semibold uppercase leading-none text-foreground">
                <ArrowUpIcon aria-hidden="true" className="size-2.5" />
                {props.countUpBadgeLabel ?? formatMessage("countUp.badge")}
              </span>
              {props.countUpPrimaryAction}
              {props.countUpScheduledStatus}
            </>
          ) : !props.isRecurring && parts.isCountUp ? (
            <TimerSinceBadge />
          ) : null}
          <TimerNotificationStateIcon timer={props.timer} />
          {props.timer.url ? (
            <a
              data-timer-card-action=""
              href={props.timer.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={formatMessage("timer.openLink")}
              title={props.timer.url}
              className="relative z-10 shrink-0 text-muted-foreground/60 transition hover:text-foreground"
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null}
          {props.isArchived ? (
            <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
              {formatMessage("timer.recurrence.archived")}
            </span>
          ) : null}
        </div>

        {/* The date line is always shown; a description gets its own line. */}
        <p
          data-slot="timer-card-date"
          className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <CalendarIcon aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">{props.sub}</span>
        </p>
        {props.timer.description?.trim() ? (
          <p
            data-slot="timer-card-description"
            className="mt-1.5 line-clamp-1 text-xs leading-[18px] text-foreground/80"
          >
            {props.timer.description.trim()}
          </p>
        ) : null}
        {/* Phones: the badge gets its own line so the name never truncates to nothing. */}
        {props.milestoneBadge ? <div className="mt-2 flex md:hidden">{props.milestoneBadge}</div> : null}
      </div>
    </div>
  )
}

export function TimerCardMobileActions(
  props: Readonly<{
    timerId?: string
    isArchived: boolean
    isPinned: boolean
    isFollowed: boolean
    notificationsEnabled: boolean
    canMove?: boolean
    onTogglePin: () => void
    onToggleNotification: () => void
    onOpenShare: () => void
    onOpenFocus: () => void
    onOpenEdit: () => void
    onOpenMove?: () => void
    onUnfollow: () => void
    onDuplicate: () => void
    onToggleArchive: () => void
    onDelete: () => void
    onMenuOpenChange?: (open: boolean) => void
    reorder?: TimerReorderActions
  }>,
) {
  return (
    <div data-timer-card-action="" className="absolute right-3 top-3 z-10 flex items-center gap-1 md:hidden">
      {props.isArchived ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`rounded-full p-1.5 ${timerActionClassName}`}
              aria-label={formatMessage(props.isPinned ? "timer.unpinAction" : "timer.pinAction")}
              aria-pressed={props.isPinned}
              onClick={(event) => {
                event.stopPropagation()
                props.onTogglePin()
              }}
            >
              <PinGlyph pinned={props.isPinned} timerId={props.timerId && `${props.timerId}:phone`} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {formatMessage(props.isPinned ? "timer.unpin" : "timer.pin")}
          </TooltipContent>
        </Tooltip>
      )}
      <TimerFocusAction
        className={`rounded-full p-1.5 ${timerActionClassName}`}
        onOpen={props.onOpenFocus}
        stopPropagation
      />
      <TimerOverflowActions
        isArchived={props.isArchived}
        isFollowed={props.isFollowed}
        notificationsEnabled={props.notificationsEnabled}
        canMove={props.canMove}
        onOpenMove={props.onOpenMove}
        onOpenEdit={props.onOpenEdit}
        onToggleNotification={props.onToggleNotification}
        onOpenShare={props.onOpenShare}
        onUnfollow={props.onUnfollow}
        onDuplicate={props.onDuplicate}
        onToggleArchive={props.onToggleArchive}
        onDelete={props.onDelete}
        onMenuOpenChange={props.onMenuOpenChange}
        reorder={props.reorder}
        triggerClassName={`rounded-full p-1.5 ${timerActionClassName}`}
        onTriggerPointerDown={(event) => {
          event.stopPropagation()
        }}
        onTriggerClick={(event) => {
          event.stopPropagation()
        }}
      />
    </div>
  )
}

// The last pin state each timer's glyphs showed. Pinning moves a card to another section,
// which mounts new glyphs (a card draws its phone and desktop trees, so several at once);
// this lets each new one start from the state the old ones showed.
const lastPinShown = new Map<string, { pinned: boolean; from?: boolean; at: number }>()

/**
 * The pin changes state in place: unpinned it leans over (45 degrees) as an outline;
 * pinned it stands upright and fills, in 220 ms on the move curve. Reduced motion keeps
 * only the fill change.
 */
export function PinGlyph(
  props: Readonly<{
    pinned: boolean
    /** Names this glyph across remounts: the timer id plus where it sits. */
    timerId?: string
    className?: string
  }>,
) {
  const ref = useRef<SVGSVGElement>(null)
  const { pinned, timerId } = props

  const mounted = useRef(false)

  useLayoutEffect(() => {
    if (!timerId) return
    const now = performance.now()
    const entry = lastPinShown.get(timerId)
    // The state before this change: the entry's own state if it differs, or the state another
    // glyph of the same timer just changed from in this same moment.
    const changedJustNow = entry !== undefined && entry.pinned === pinned && now - entry.at < MOTION_MS.enter
    const last = entry === undefined ? undefined : entry.pinned !== pinned ? entry.pinned : changedJustNow ? entry.from : undefined
    if (entry === undefined || entry.pinned !== pinned) lastPinShown.set(timerId, { pinned, from: entry?.pinned, at: now })
    // A glyph that stays mounted changes through its CSS transition; only a new glyph
    // (the card moved to another section) needs to be started from the old state.
    const fresh = !mounted.current
    mounted.current = true
    const element = ref.current
    if (!fresh || last === undefined || last === pinned || !canAnimate(element)) return
    const turn = prefersReducedMotion()
      ? []
      : [{ rotate: last ? "0deg" : "45deg" }, { rotate: pinned ? "0deg" : "45deg" }]
    // Not cancelled on cleanup: a strict re-run of this effect must not cut it short.
    element.animate(
      turn.length > 0
        ? [
            { ...turn[0], fillOpacity: last ? 1 : 0 },
            { ...turn[1], fillOpacity: pinned ? 1 : 0 },
          ]
        : [{ fillOpacity: last ? 1 : 0 }, { fillOpacity: pinned ? 1 : 0 }],
      { duration: MOTION_MS.enter, easing: MOVE_EASING },
    )
  }, [pinned, timerId])

  return (
    <PinIcon
      ref={ref}
      aria-hidden="true"
      data-pinned={pinned || undefined}
      className={cn(
        "size-4 fill-current transition-[rotate,fill-opacity] duration-enter ease-move motion-reduce:transition-[fill-opacity]",
        pinned ? "rotate-0 [fill-opacity:1]" : "rotate-45 [fill-opacity:0]",
        props.className,
      )}
    />
  )
}

function TimerPinAction(
  props: Readonly<{
    timerId?: string
    isArchived: boolean
    isPinned: boolean
    onTogglePin: () => void
  }>,
) {
  if (props.isArchived) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={timerActionClassName}
          aria-label={formatMessage(props.isPinned ? "timer.unpinAction" : "timer.pinAction")}
          aria-pressed={props.isPinned}
          onClick={props.onTogglePin}
        >
          <PinGlyph pinned={props.isPinned} timerId={props.timerId && `${props.timerId}:desktop`} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {formatMessage(props.isPinned ? "timer.unpin" : "timer.pin")}
      </TooltipContent>
    </Tooltip>
  )
}

export function TimerFocusDesktopAction(props: Readonly<{ onOpenFocus: () => void }>) {
  return <TimerFocusAction className={timerActionClassName} onOpen={props.onOpenFocus} />
}

export function TimerOverflowActions(
  props: Readonly<{
    isArchived: boolean
    isFollowed: boolean
    notificationsEnabled: boolean
    canMove?: boolean
    onOpenMove?: () => void
    onOpenEdit: () => void
    onToggleNotification: () => void
    onOpenShare: () => void
    onUnfollow: () => void
    onDuplicate: () => void
    onToggleArchive: () => void
    onDelete: () => void
    onMenuOpenChange?: (open: boolean) => void
    reorder?: TimerReorderActions
    // The compact card has no pin button of its own; Pin lives in its menu.
    pin?: { isPinned: boolean; onTogglePin: () => void }
    triggerClassName?: string
    onTriggerPointerDown?: (event: StopPropagationEvent) => void
    onTriggerClick?: (event: StopPropagationEvent) => void
  }>,
) {
  return (
    <DropdownMenu onOpenChange={props.onMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={props.triggerClassName ?? timerActionClassName}
          aria-label={formatMessage("timer.actions.openMenu")}
          onPointerDown={props.onTriggerPointerDown}
          onClick={props.onTriggerClick}
        >
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={MENU_MOTION_CLASSNAME}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        {props.pin && !props.isArchived ? (
          <>
            <DropdownMenuItem onSelect={() => props.pin?.onTogglePin()}>
              {formatMessage(props.pin.isPinned ? "timer.unpin" : "timer.pin")}
            </DropdownMenuItem>
            {props.reorder ? null : <DropdownMenuSeparator />}
          </>
        ) : null}
        {props.reorder ? (
          <>
            <DropdownMenuItem disabled={!props.reorder.onMoveEarlier} onSelect={() => props.reorder?.onMoveEarlier?.()}>
              {formatMessage("timer.moveEarlier")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!props.reorder.onMoveLater} onSelect={() => props.reorder?.onMoveLater?.()}>
              {formatMessage("timer.moveLater")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {props.isFollowed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block">
                <DropdownMenuItem disabled>{formatMessage("common.edit")}</DropdownMenuItem>
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={6} className="max-w-[220px]">
              {formatMessage("timer.unfollowOrDuplicate")}
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuItem onSelect={() => props.onOpenEdit()}>{formatMessage("common.edit")}</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => props.onToggleNotification()}>
          {formatMessage(props.notificationsEnabled ? "notifications.disableMenu" : "notifications.enableMenu")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onToggleArchive()}>
          {formatMessage(props.isArchived ? "common.restore" : "common.archive")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onOpenShare()}>{formatMessage("common.share")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onDuplicate()}>{formatMessage("common.duplicate")}</DropdownMenuItem>
        {props.canMove && props.onOpenMove ? (
          <DropdownMenuItem onSelect={() => props.onOpenMove?.()}>
            {formatMessage("timer.move.action")}
          </DropdownMenuItem>
        ) : null}
        {props.isFollowed ? (
          <DropdownMenuItem onSelect={() => props.onUnfollow()}>{formatMessage("timer.unfollow")}</DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => props.onDelete()}>
          {formatMessage("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TimerCardDesktopActions(
  props: Readonly<{
    timerId?: string
    isArchived: boolean
    isPinned: boolean
    isFollowed: boolean
    notificationsEnabled: boolean
    canMove?: boolean
    onTogglePin: () => void
    onToggleNotification: () => void
    onOpenShare: () => void
    onOpenFocus: () => void
    onOpenMove?: () => void
    onOpenEdit: () => void
    onUnfollow: () => void
    onDuplicate: () => void
    onToggleArchive: () => void
    onDelete: () => void
    onMenuOpenChange?: (open: boolean) => void
    reorder?: TimerReorderActions
  }>,
) {
  return (
    <div className="hidden shrink-0 items-center gap-1 md:flex">
      <TimerPinAction
        timerId={props.timerId}
        isArchived={props.isArchived}
        isPinned={props.isPinned}
        onTogglePin={props.onTogglePin}
      />
      <TimerFocusDesktopAction onOpenFocus={props.onOpenFocus} />
      <TimerOverflowActions
        isArchived={props.isArchived}
        isFollowed={props.isFollowed}
        notificationsEnabled={props.notificationsEnabled}
        canMove={props.canMove}
        onOpenMove={props.onOpenMove}
        onOpenEdit={props.onOpenEdit}
        onToggleNotification={props.onToggleNotification}
        onOpenShare={props.onOpenShare}
        onUnfollow={props.onUnfollow}
        onDuplicate={props.onDuplicate}
        onToggleArchive={props.onToggleArchive}
        onDelete={props.onDelete}
        onMenuOpenChange={props.onMenuOpenChange}
        reorder={props.reorder}
      />
    </div>
  )
}

export function TimerImageAttribution(props: Readonly<{ timer: Timer }>) {
  if (!props.timer.image) return null

  return (
    <div className="px-2 pt-1 text-[10px] text-muted-foreground/50">
      {formatMessage("unsplash.attribution")}{" "}
      <a
        href={`${props.timer.image.authorUrl}?utm_source=tickward&utm_medium=referral`}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-muted-foreground"
      >
        {props.timer.image.authorName}
      </a>
      {" / "}
      <a
        href="https://unsplash.com/?utm_source=tickward&utm_medium=referral"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-muted-foreground"
      >
        Unsplash
      </a>
    </div>
  )
}

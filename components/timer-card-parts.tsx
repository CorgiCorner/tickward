import { BellOffIcon, EllipsisVerticalIcon, ExternalLinkIcon, PinIcon, PinOffIcon, RepeatIcon } from "lucide-react"
import Image from "next/image"
import type { MouseEvent, ReactNode } from "react"

import { TimerFocusAction } from "@/components/timer-focus-action"
import { useNow } from "@/components/use-now"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

const timerActionClassName =
  "text-muted-foreground/75 hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50"

type StopPropagationEvent = {
  stopPropagation: () => void
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

function TimerSpaceDot(props: Readonly<{ timer: Timer; space?: Space }>) {
  const accent = timerAccentColor(props.timer, props.space)

  return (
    <span
      className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
      style={accent ? { backgroundColor: accent } : undefined}
    />
  )
}

function TimerRecurrenceBadge(props: Readonly<{ timer: Timer; history: RecurrenceHistory }>) {
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

function TimerNotificationStateIcon(props: Readonly<{ timer: Timer }>) {
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

function TimerSinceBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
      {formatMessage("timer.countdown.since")}
    </span>
  )
}

function HeroCountdownUnit(
  props: Readonly<{
    value: string
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
      <span className="mt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{props.label}</span>
    </div>
  )
}

function HeroCountdownSeparator() {
  return <span className="flex h-[40px] items-center text-xl leading-none text-muted-foreground/35">:</span>
}

function HeroCountdown(props: Readonly<{ targetDateIsoUtc: string; nowMs: number }>) {
  const parts = getCountdownParts(props.targetDateIsoUtc, props.nowMs)

  return (
    <div>
      <div className="flex items-start gap-1.5 font-mono tabular-nums">
        {/* references: timer.countdown.dayUnit.one / timer.countdown.dayUnit.few / timer.countdown.dayUnit.many */}
        <HeroCountdownUnit
          value={String(parts.days)}
          label={formatPluralMessage("timer.countdown.dayUnit", parts.days)}
        />
        <HeroCountdownSeparator />
        <HeroCountdownUnit value={pad2(parts.hours)} label={formatMessage("timer.countdown.hoursShort")} />
        <HeroCountdownSeparator />
        <HeroCountdownUnit value={pad2(parts.minutes)} label={formatMessage("timer.countdown.minutesShort")} />
        <HeroCountdownSeparator />
        <HeroCountdownUnit value={pad2(parts.seconds)} label={formatMessage("timer.countdown.secondsShort")} muted />
      </div>
    </div>
  )
}

function TimerProgressBar(
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
    hasDragHandle: boolean
  }>,
) {
  const nowMs = useNow()

  return (
    <>
      <div className={cn("mt-5 min-w-0 overflow-x-auto pb-1", props.hasDragHandle ? "pl-5" : "")}>
        <HeroCountdown targetDateIsoUtc={props.effectiveTarget} nowMs={nowMs} />
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
    mobileActions: ReactNode
    desktopActions: ReactNode
    onMobileCardTap?: () => void
  }>,
) {
  function handleRootClick(event: MouseEvent<HTMLElement>) {
    if (!props.onMobileCardTap) return
    if (event.target instanceof Element && event.target.closest("[data-timer-card-action]")) return
    props.onMobileCardTap()
  }

  return (
    <article
      className={cn(
        // overflow-hidden lets the card clip the bottom-border progress strip to its
        // own rounded corners (a 3px strip can't reproduce the 12px corner itself).
        "group relative min-w-0 w-full overflow-hidden rounded-[12px] border border-border bg-card px-4 pb-6 pt-4 transition-colors",
        props.isArchived ? "bg-card/70 text-muted-foreground" : "",
      )}
      onClick={handleRootClick}
    >
      {props.mobileActions}

      <div className="flex min-w-0 items-start justify-between gap-3">
        {props.dragHandle}
        <TimerCardTitleBlock
          timer={props.timer}
          effectiveTarget={props.effectiveTarget}
          nowMs={props.nowMs}
          sub={props.sub}
          isArchived={props.isArchived}
          isRecurring={props.isRecurring}
          history={props.history}
          space={props.space}
          hasDragHandle={Boolean(props.dragHandle)}
        />
        <div data-timer-card-action="" className="hidden shrink-0 md:block">
          {props.desktopActions}
        </div>
      </div>

      <TimerLiveCountdown
        timer={props.timer}
        effectiveTarget={props.effectiveTarget}
        history={props.history}
        hasDragHandle={Boolean(props.dragHandle)}
      />
    </article>
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
    hasDragHandle?: boolean
  }>,
) {
  const parts = getCountdownParts(props.effectiveTarget, props.nowMs)

  return (
    <div className={cn("flex min-w-0 items-start gap-2 pr-24 md:pr-0", props.hasDragHandle ? "pl-5" : "")}>
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
          <TimerSpaceDot timer={props.timer} space={props.space} />
          <h4 className="truncate text-sm font-semibold tracking-normal">{props.timer.label}</h4>
          {props.isRecurring ? <TimerRecurrenceBadge timer={props.timer} history={props.history} /> : null}
          {!props.isRecurring && parts.isCountUp ? <TimerSinceBadge /> : null}
          <TimerNotificationStateIcon timer={props.timer} />
          {props.timer.url ? (
            <a
              data-timer-card-action=""
              href={props.timer.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={formatMessage("timer.openLink")}
              title={props.timer.url}
              className="shrink-0 text-muted-foreground/60 transition hover:text-foreground"
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

        {/* Description takes the date's slot when present; the exact date still
            shows in the countdown below. */}
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
          {props.timer.description?.trim() || props.sub}
        </p>
      </div>
    </div>
  )
}

export function TimerCardMobileActions(
  props: Readonly<{
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
              {props.isPinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
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

function TimerPinAction(
  props: Readonly<{
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
          {props.isPinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {formatMessage(props.isPinned ? "timer.unpin" : "timer.pin")}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerFocusDesktopAction(props: Readonly<{ onOpenFocus: () => void }>) {
  return <TimerFocusAction className={timerActionClassName} onOpen={props.onOpenFocus} />
}

function TimerOverflowActions(
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
    triggerClassName?: string
    onTriggerPointerDown?: (event: StopPropagationEvent) => void
    onTriggerClick?: (event: StopPropagationEvent) => void
  }>,
) {
  return (
    <DropdownMenu>
      <span className="inline-flex" onPointerDown={props.onTriggerPointerDown} onClick={props.onTriggerClick}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={props.triggerClassName ?? timerActionClassName}
            aria-label={formatMessage("timer.actions.openMenu")}
          >
            <EllipsisVerticalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
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
  }>,
) {
  return (
    <div className="hidden shrink-0 items-center gap-1 md:flex">
      <TimerPinAction isArchived={props.isArchived} isPinned={props.isPinned} onTogglePin={props.onTogglePin} />
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

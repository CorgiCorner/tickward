"use client"

import { BellIcon, CheckIcon, ChevronDownIcon, ExternalLinkIcon, FlagIcon } from "lucide-react"
import { useState, type CSSProperties, type ReactNode } from "react"

import {
  capitalizeFirst,
  formatDetailDate,
  formatDetailDateTime,
  formatInDays,
  formatMilestoneAmount,
  formatMilestoneRules,
  formatShortDate,
} from "@/components/timer-detail/timer-detail-format"
import {
  countdownProgress,
  countdownReminderRows,
  countUpStretch,
  detailMilestones,
  detailTarget,
  isCountUpTimer,
  milestoneReachedToday,
  zonedCalendarDaysBetween,
} from "@/components/timer-detail/timer-detail-model"
import type { MilestoneMomentPhase } from "@/components/dashboard/use-milestone-moment"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formatMessage } from "@/lib/i18n/messages"
import type { MilestoneOccurrence } from "@/lib/milestones"
import { timerNotificationsEnabled } from "@/lib/notification-preferences"
import { formatTimerReminderOffset } from "@/lib/timer-reminder-offset"
import type { Space, Timer } from "@/lib/types"
import { cn } from "@/lib/utils"

const sectionLabelClassName =
  "font-mono text-[10px] font-medium uppercase leading-none tracking-[0.14em] text-muted-foreground"

export function timerDetailAccent(timer: Timer, space: Space | undefined) {
  return timer.color || space?.color || undefined
}

function AccentDot(props: Readonly<{ accent?: string; className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={cn("shrink-0 rounded-full bg-muted-foreground/40", props.className)}
      style={props.accent ? { backgroundColor: props.accent } : undefined}
    />
  )
}

function MilestoneReachedBadge(props: Readonly<{ accent?: string; phase?: MilestoneMomentPhase }>) {
  const accent = props.accent ?? "var(--muted-foreground)"
  // Tinted with the timer colour; the text stays in the text colour so it
  // reads on every accent.
  const style: CSSProperties = {
    borderColor: `color-mix(in oklab, ${accent} 45%, var(--border))`,
    backgroundColor: `color-mix(in oklab, ${accent} 12%, var(--card))`,
  }
  return (
    <span
      data-testid="timer-detail-milestone-badge"
      data-phase={props.phase ?? "done"}
      className={cn(
        "inline-flex shrink-0 origin-left items-center gap-1.5 whitespace-nowrap rounded-full border px-[11px] py-[5px] text-xs font-semibold leading-4 text-foreground motion-reduce:scale-100",
        // It arrives as the count settles, as on the card.
        props.phase === "before"
          ? "scale-95 opacity-0 transition-none"
          : "scale-100 opacity-100 transition-[opacity,scale] delay-[160ms] duration-enter ease-move",
      )}
      style={style}
    >
      <FlagIcon aria-hidden="true" className="size-3" style={{ color: accent }} strokeWidth={2.5} />
      {formatMessage("timerDetail.milestoneReached")}
    </span>
  )
}

export function TimerDetailHeading(
  props: Readonly<{ timer: Timer; space?: Space; nowMs: number; momentPhase?: MilestoneMomentPhase }>,
) {
  const { nowMs, timer } = props
  const accent = timerDetailAccent(timer, props.space)
  const countsUp = isCountUpTimer(timer)
  const reachedToday = countsUp ? milestoneReachedToday(timer, nowMs) : null
  const target = detailTarget(timer, nowMs)
  const when = countsUp
    ? formatMessage("timerDetail.since", { date: formatDetailDate(target, timer.timezone) ?? target })
    : (formatDetailDateTime(target, timer.timezone, nowMs) ?? target)
  const note = timer.description?.trim()

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2 md:gap-2.5">
          <AccentDot accent={accent} className="size-2 md:size-[9px]" />
          <DialogTitle className="min-w-0 break-words text-xl font-semibold leading-tight tracking-[-0.01em] md:text-2xl">
            {timer.label}
          </DialogTitle>
          {countsUp ? (
            <span className="inline-flex shrink-0 items-center rounded border border-border px-[5px] py-[3px] font-mono text-[9px] font-medium uppercase leading-none tracking-[0.1em] text-muted-foreground">
              {formatMessage("timer.countdown.since")}
            </span>
          ) : null}
        </div>
        {reachedToday ? <MilestoneReachedBadge accent={accent} phase={props.momentPhase} /> : null}
      </div>
      <DialogDescription className="mt-1.5 text-xs text-muted-foreground md:mt-2 md:text-sm">
        {[when, timer.timezone].join(" · ")}
      </DialogDescription>
      {note ? (
        <p className="mt-2 whitespace-pre-line text-[13px] leading-[19px] text-foreground/80 md:text-sm md:leading-[21px]">
          {note}
        </p>
      ) : null}
      {timer.url ? (
        <a
          href={timer.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 inline-flex w-fit max-w-full items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{timer.url}</span>
        </a>
      ) : null}
    </div>
  )
}

function ProgressTrack(
  props: Readonly<{
    fraction: number
    accent?: string
    label: string
    markers?: Array<{ key: string; fraction: number }>
  }>,
) {
  return (
    <div role="img" aria-label={props.label} className="relative h-[5px] rounded-full bg-border">
      <div
        data-testid="timer-detail-progress-fill"
        className={cn("h-full min-w-1.5 rounded-full", props.accent ? "" : "bg-blue-600 dark:bg-blue-500")}
        style={{ width: `${props.fraction * 100}%`, ...(props.accent ? { backgroundColor: props.accent } : {}) }}
      />
      {props.markers?.map((marker) => (
        <span
          key={marker.key}
          data-testid="timer-detail-progress-marker"
          className="absolute -top-1 h-[13px] w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground"
          style={{ left: `${marker.fraction * 100}%` }}
        />
      ))}
    </div>
  )
}

export function TimerDetailProgress(props: Readonly<{ timer: Timer; space?: Space; nowMs: number }>) {
  const { nowMs, timer } = props
  const accent = timerDetailAccent(timer, props.space)

  if (isCountUpTimer(timer)) {
    const stretch = countUpStretch(timer, nowMs)
    if (!stretch) return null
    const start = stretch.from
      ? formatMilestoneAmount(stretch.from)
      : formatMessage("timerDetail.progress.started", {
          date: formatShortDate(stretch.fromMs, timer.timezone) ?? "",
        })
    const endAmount = formatMilestoneAmount(stretch.to)
    const end = stretch.reachedToday
      ? formatMessage("timerDetail.milestones.reachedToday", { label: endAmount })
      : `${endAmount} · ${formatShortDate(stretch.toMs, timer.timezone) ?? ""}`
    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-between gap-4 text-xs text-muted-foreground">
          <span>{start}</span>
          <span className="text-right">{end}</span>
        </div>
        <ProgressTrack fraction={stretch.fraction} accent={accent} label={`${start} · ${end}`} />
      </div>
    )
  }

  const progress = countdownProgress(timer, nowMs)
  if (!progress) return null
  const label = [
    formatMessage("timer.progress.start", {
      date: formatDetailDateTime(progress.startMs, timer.timezone, nowMs) ?? "",
    }),
    formatMessage("timer.progress.target", {
      date: formatDetailDateTime(progress.targetMs, timer.timezone, nowMs) ?? "",
    }),
  ].join(" · ")
  return (
    <ProgressTrack
      fraction={progress.fraction}
      accent={accent}
      label={label}
      markers={progress.reminders.map((reminder) => ({
        key: String(reminder.offsetMinutes),
        fraction: reminder.fraction,
      }))}
    />
  )
}

function ListRow(
  props: Readonly<{
    icon: ReactNode
    label: string
    detail: string
    strong?: boolean
    dimmed?: boolean
    testId?: string
  }>,
) {
  return (
    <li
      data-testid={props.testId}
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border py-[11px] last:border-b-0",
        props.dimmed && "text-muted-foreground",
      )}
    >
      <span className={cn("flex min-w-0 items-center gap-2.5 text-sm", props.strong && "font-medium")}>
        {props.icon}
        <span className="truncate">{props.label}</span>
      </span>
      <span className={cn("shrink-0 text-right text-xs", props.strong ? "font-medium" : "text-muted-foreground")}>
        {props.detail}
      </span>
    </li>
  )
}

const VISIBLE_REACHED = 3

function milestoneKey(milestone: MilestoneOccurrence) {
  return `${milestone.at}:${milestone.unit}:${milestone.count}`
}

export function TimerDetailMilestones(props: Readonly<{ timer: Timer; nowMs: number; onEditRules?: () => void }>) {
  const { nowMs, timer } = props
  const [showAll, setShowAll] = useState(false)
  const rules = timer.milestones?.rules ?? []
  const milestones = detailMilestones(timer, nowMs)
  const hiddenCount = milestones.reached.length - VISIBLE_REACHED
  const reached = showAll ? milestones.reached : milestones.reached.slice(0, VISIBLE_REACHED)
  const reachedIcon = (
    <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.5} />
  )

  return (
    <section aria-labelledby="timer-detail-milestones-title" className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 id="timer-detail-milestones-title" className={sectionLabelClassName}>
          {formatMessage("timerDetail.milestones.title")}
        </h3>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {rules.length > 0 ? <span>{formatMilestoneRules(rules)}</span> : null}
          {props.onEditRules ? (
            <>
              {rules.length > 0 ? <span aria-hidden="true">·</span> : null}
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto px-0 text-xs font-normal text-foreground underline underline-offset-2 has-[>svg]:px-0"
                onClick={props.onEditRules}
              >
                {formatMessage("timerDetail.milestones.editRules")}
              </Button>
            </>
          ) : null}
        </span>
      </div>
      {rules.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{formatMessage("timerDetail.milestones.none")}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {milestones.upcoming.map((milestone) => {
            const atMs = new Date(milestone.at).getTime()
            const days = zonedCalendarDaysBetween(nowMs, atMs, timer.timezone)
            const date = formatDetailDate(milestone.at, timer.timezone) ?? milestone.at
            return (
              <ListRow
                key={milestoneKey(milestone)}
                testId="timer-detail-milestone-upcoming"
                icon={<FlagIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
                label={formatMilestoneAmount(milestone)}
                detail={days > 0 ? `${date} · ${formatInDays(days)}` : formatMessage("timerDetail.milestones.today")}
              />
            )
          })}
          {milestones.today ? (
            <ListRow
              testId="timer-detail-milestone-today"
              icon={<CheckIcon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.5} />}
              label={formatMilestoneAmount(milestones.today)}
              detail={formatMessage("timerDetail.milestones.today")}
              strong
            />
          ) : null}
          {reached.map((milestone) => (
            <ListRow
              key={milestoneKey(milestone)}
              testId="timer-detail-milestone-reached"
              icon={reachedIcon}
              label={formatMilestoneAmount(milestone)}
              detail={formatDetailDate(milestone.at, timer.timezone) ?? milestone.at}
            />
          ))}
        </ul>
      )}
      {hiddenCount > 0 && !showAll ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="-ml-1.5 mt-1 w-fit text-muted-foreground"
          onClick={() => setShowAll(true)}
        >
          {formatMessage("timerDetail.milestones.showEarlier", {
            count: `${hiddenCount}${milestones.reachedTruncated ? "+" : ""}`,
          })}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      ) : null}
    </section>
  )
}

function reminderDeliveryNote(timer: Timer, signedIn: boolean) {
  if (!timerNotificationsEnabled(timer.notification, timer.notify)) return formatMessage("timer.notificationsOff")
  return signedIn ? formatMessage("timerDetail.reminders.delivery") : formatMessage("timer.form.reminders.signedOut")
}

export function TimerDetailReminders(props: Readonly<{ timer: Timer; nowMs: number; signedIn: boolean }>) {
  const { nowMs, timer } = props
  const rows = countdownReminderRows(timer, nowMs)

  return (
    <section aria-labelledby="timer-detail-reminders-title" className="flex flex-col">
      <h3 id="timer-detail-reminders-title" className={sectionLabelClassName}>
        {formatMessage("timerDetail.reminders.title")}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{formatMessage("timerDetail.reminders.none")}</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col">
            {rows.map((row) => (
              <ListRow
                key={row.offsetMinutes}
                testId="timer-detail-reminder"
                icon={<BellIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
                label={capitalizeFirst(formatTimerReminderOffset(row.offsetMinutes))}
                detail={formatDetailDateTime(row.atMs, timer.timezone, nowMs) ?? ""}
                dimmed={row.past}
              />
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{reminderDeliveryNote(timer, props.signedIn)}</p>
        </>
      )}
    </section>
  )
}

function Fact(props: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <dt className={sectionLabelClassName}>{props.label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">{props.children}</dd>
    </div>
  )
}

function recurrenceLabel(type: NonNullable<Timer["recurrence"]>["type"]) {
  if (type === "daily") return formatMessage("timer.form.recurrence.daily")
  if (type === "weekly") return formatMessage("timer.form.recurrence.weekly")
  if (type === "monthly") return formatMessage("timer.form.recurrence.monthly")
  return formatMessage("timer.form.recurrence.yearly")
}

export function TimerDetailFacts(
  props: Readonly<{
    timer: Timer
    space?: Space
    signedIn: boolean
    onCopyShareLink?: () => void
  }>,
) {
  const { timer } = props
  const countsUp = isCountUpTimer(timer)
  const notificationsOn = timerNotificationsEnabled(timer.notification, timer.notify)
  const shared = Boolean(timer.sharedAt)

  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
      {countsUp ? (
        <Fact label={formatMessage("timerDetail.reminders.title")}>
          {notificationsOn
            ? props.signedIn
              ? formatMessage("timerDetail.reminders.atMilestones")
              : formatMessage("timer.form.reminders.signedOut")
            : formatMessage("timer.notificationsOff")}
        </Fact>
      ) : null}
      {!countsUp && timer.recurrence?.enabled ? (
        <Fact label={formatMessage("timerDetail.repeats.title")}>{recurrenceLabel(timer.recurrence.type)}</Fact>
      ) : null}
      <Fact label={formatMessage("timerDetail.sharing.title")}>
        <span>{formatMessage(shared ? "timerDetail.sharing.on" : "timerDetail.sharing.off")}</span>
        {shared && props.onCopyShareLink ? (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto px-0 text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={props.onCopyShareLink}
          >
            {formatMessage("timerDetail.sharing.copy")}
          </Button>
        ) : null}
      </Fact>
      <Fact label={formatMessage("timerDetail.space.title")}>
        {props.space ? (
          <span className="flex min-w-0 items-center gap-2">
            <AccentDot accent={props.space.color} className="size-[7px]" />
            <span className="truncate">{props.space.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{formatMessage("organizer.unassigned")}</span>
        )}
      </Fact>
      <Fact label={formatMessage("timerDetail.created.title")}>
        {formatShortDate(timer.createdAt, timer.timezone) ?? timer.createdAt}
      </Fact>
    </dl>
  )
}

"use client"

import type { ReactNode } from "react"

import {
  countUpCalendarFormatAvailable,
  countUpCalendarLead,
  countUpCalendarParts,
  effectiveCountUpFormat,
  spokenCountUp,
  useCountUpFormat,
  type CountUpCalendarParts,
  type CountUpFormat,
} from "@/components/dashboard/count-up-format"
import type { MilestoneMomentPhase } from "@/components/dashboard/use-milestone-moment"
import { MilestoneRoll } from "@/components/timer-card-parts"
import { GroupedNumber } from "@/components/timer-detail/grouped-number"
import { detailTarget, isCountUpTimer } from "@/components/timer-detail/timer-detail-model"
import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import type { Timer } from "@/lib/types"
import { cn, getCountdownParts, pad2 } from "@/lib/utils"

const valueClassName = "text-[40px] font-semibold leading-none tracking-normal md:text-[64px]"
const labelClassName =
  "text-[10px] font-normal uppercase leading-none tracking-[0.12em] text-muted-foreground md:text-[11px] md:tracking-[0.14em]"

function CounterUnit(props: Readonly<{ value: ReactNode; label: string; muted?: boolean }>) {
  return (
    <span className="flex flex-col items-center gap-2.5 md:gap-3">
      <span className={cn(valueClassName, props.muted && "text-muted-foreground/55")} suppressHydrationWarning>
        {props.value}
      </span>
      <span className={labelClassName}>{props.label}</span>
    </span>
  )
}

const DAY_MS = 86_400_000

function DaysCounter(props: Readonly<{ targetIso: string; nowMs: number; rollPhase?: MilestoneMomentPhase }>) {
  const parts = getCountdownParts(props.targetIso, props.nowMs)
  const yesterday = props.rollPhase ? getCountdownParts(props.targetIso, props.nowMs - DAY_MS).days : undefined
  return (
    <span
      data-testid="timer-detail-days"
      className="flex w-full items-start justify-between font-mono tabular-nums md:w-auto md:justify-start md:gap-7"
    >
      {/* references: timer.countdown.dayUnit.one / timer.countdown.dayUnit.few / timer.countdown.dayUnit.many */}
      <CounterUnit
        value={
          <MilestoneRoll
            value={<GroupedNumber value={parts.days} />}
            from={yesterday === undefined ? undefined : <GroupedNumber value={yesterday} />}
            phase={props.rollPhase}
          />
        }
        label={formatPluralMessage("timer.countdown.dayUnit", parts.days)}
      />
      <CounterUnit value={pad2(parts.hours)} label={formatMessage("timerDetail.unit.hours")} />
      <CounterUnit value={pad2(parts.minutes)} label={formatMessage("timerDetail.unit.minutes")} />
      <CounterUnit value={pad2(parts.seconds)} label={formatMessage("timerDetail.unit.seconds")} muted />
    </span>
  )
}

// references: milestone.unit.years.one / milestone.unit.months.one / milestone.unit.days.one
function CalendarCounter(
  props: Readonly<{ parts: CountUpCalendarParts; yesterday?: CountUpCalendarParts; rollPhase?: MilestoneMomentPhase }>,
) {
  const lead = countUpCalendarLead(props.parts)
  const before = props.yesterday ? countUpCalendarLead(props.yesterday) : undefined
  const from = before && before.unit === lead.unit && before.value !== lead.value ? before.value : undefined
  const rest = lead.rest
    .map((part) => `${part.value} ${formatPluralMessage(`milestone.unit.${part.unit}`, part.value)}`)
    .join(", ")
  const clock = `${pad2(props.parts.hours)}:${pad2(props.parts.minutes)}:${pad2(props.parts.seconds)}`

  return (
    <span data-testid="timer-detail-calendar" className="flex flex-col items-start gap-3">
      <span className="flex items-baseline gap-3 md:gap-3.5">
        <span className={cn(valueClassName, "font-mono tabular-nums")} suppressHydrationWarning>
          <MilestoneRoll value={lead.value} from={from} phase={props.rollPhase} />
        </span>
        <span className="text-[22px] font-semibold leading-none tracking-[-0.01em] md:text-[34px]">
          {formatPluralMessage(`milestone.unit.${lead.unit}`, lead.value)}
        </span>
      </span>
      <span className="flex items-baseline gap-3.5 text-[15px] leading-4">
        {rest ? <span className="text-foreground/80">{rest}</span> : null}
        <span
          className="font-mono text-[13px] tracking-[0.04em] text-muted-foreground tabular-nums"
          suppressHydrationWarning
        >
          {clock}
        </span>
      </span>
    </span>
  )
}

function layerClassName(shown: boolean) {
  // Cross-fade: the incoming layer fades in over 220 ms, the outgoing one out
  // over 160 ms, and only then turns invisible (visibility flips at the end of
  // its transition). Opacity only, so reduced motion keeps it as is.
  return cn(
    "col-start-1 row-start-1 transition-[opacity,visibility] ease-fade",
    shown ? "visible opacity-100 duration-enter" : "invisible opacity-0 duration-exit",
  )
}

function FormatSwitch(props: Readonly<{ format: CountUpFormat; onChange: (format: CountUpFormat) => void }>) {
  const options: Array<{ value: CountUpFormat; label: string }> = [
    { value: "days", label: formatMessage("timerDetail.format.days") },
    { value: "calendar", label: formatMessage("timerDetail.format.calendar") },
  ]

  return (
    <div
      role="group"
      aria-label={formatMessage("timerDetail.format.group")}
      className="flex w-fit items-center gap-0.5 rounded-full border border-border p-[3px]"
    >
      {options.map((option) => {
        const active = props.format === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-[5px] text-xs font-medium leading-4 outline-none transition-colors duration-press ease-fade focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The big counter. Count-ups older than a month can read as total days or as
 * years, months and days: the switch under the number and a click on the
 * number both change it, and the choice is kept on this device per timer.
 */
export function TimerDetailCounter(
  props: Readonly<{ timer: Timer; nowMs: number; rollPhase?: MilestoneMomentPhase }>,
) {
  const { nowMs, rollPhase, timer } = props
  const targetIso = detailTarget(timer, nowMs)
  const countsUp = isCountUpTimer(timer) && getCountdownParts(targetIso, nowMs).isCountUp
  const calendarParts = countsUp ? countUpCalendarParts(timer.targetDate, timer.timezone, nowMs) : null
  const [storedFormat, setFormat] = useCountUpFormat(timer.id)

  if (!calendarParts || !countUpCalendarFormatAvailable(calendarParts)) {
    return <DaysCounter targetIso={targetIso} nowMs={nowMs} rollPhase={rollPhase} />
  }
  const yesterdayParts = rollPhase ? countUpCalendarParts(timer.targetDate, timer.timezone, nowMs - DAY_MS) : undefined

  const format = effectiveCountUpFormat(storedFormat, calendarParts)
  const toggleLabel = formatMessage(
    format === "days" ? "timerDetail.format.showCalendar" : "timerDetail.format.showDays",
  )

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        aria-label={`${spokenCountUp(format, getCountdownParts(targetIso, nowMs).days, calendarParts)}. ${toggleLabel}`}
        title={toggleLabel}
        data-testid="timer-detail-format-toggle"
        className="grid w-full justify-items-start rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:w-fit"
        onClick={() => setFormat(format === "days" ? "calendar" : "days")}
      >
        <span aria-hidden={format !== "days"} className={cn(layerClassName(format === "days"), "w-full md:w-auto")}>
          <DaysCounter targetIso={targetIso} nowMs={nowMs} rollPhase={rollPhase} />
        </span>
        <span aria-hidden={format !== "calendar"} className={layerClassName(format === "calendar")}>
          <CalendarCounter parts={calendarParts} yesterday={yesterdayParts} rollPhase={rollPhase} />
        </span>
      </button>
      <FormatSwitch format={format} onChange={setFormat} />
    </div>
  )
}

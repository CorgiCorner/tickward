"use client"

import { BellIcon, CheckIcon, FlagIcon, Maximize2Icon } from "lucide-react"
import type { CSSProperties, ReactNode, Ref } from "react"

import { useCountUpFormat } from "@/components/dashboard/count-up-format"
import { PRESS_CLASSNAME } from "@/components/dashboard/motion"
import { PinGlyph } from "@/components/timer-card-parts"
import { Button } from "@/components/ui/button"
import { formatMessage } from "@/lib/i18n/messages"
import type { Timer } from "@/lib/types"
import { cn } from "@/lib/utils"

import styles from "./dial.module.css"
import { useDialNow } from "./dial-clock"
import { DialFace } from "./dial-face"
import {
  dialCount,
  formatDialDateLine,
  formatDialLegend,
  formatDialNumber,
  formatDialReminder,
  formatMilestoneLabel,
  formatTrailNote,
} from "./dial-format"
import { dialTimerView, milestoneTrail, type DialTrailItem } from "./dial-model"
import { useMilestoneMoment, type DialMomentLedger } from "./milestone-moment"

const iconButtonClassName = cn("text-muted-foreground hover:text-foreground", PRESS_CLASSNAME)

function TrailBadge(props: Readonly<{ item: DialTrailItem; nowMs: number }>) {
  const { item } = props
  const note = formatTrailNote(item, props.nowMs)
  return (
    <li
      data-state={item.state}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-2.5 py-1 text-xs font-medium leading-4",
        item.state === "reached" &&
          "border-[color-mix(in_oklab,var(--dial-color)_40%,var(--border))] bg-[color-mix(in_oklab,var(--dial-color)_12%,var(--card))] text-foreground",
        item.state === "next" && "border-[var(--dial-color)] text-foreground",
        item.state === "later" && "border-border text-muted-foreground",
      )}
    >
      {item.state === "reached" ? (
        <CheckIcon aria-hidden="true" className="size-[11px] text-[var(--dial-color)]" strokeWidth={3} />
      ) : null}
      {formatMilestoneLabel(item.milestone)}
      {note ? <span className="font-normal text-muted-foreground">{note}</span> : null}
    </li>
  )
}

export type DialHeroProps = Readonly<{
  timer: Timer
  color?: string
  onTogglePin?: (timer: Timer) => void
  onOpenFocus?: () => void
  focusButtonRef?: Ref<HTMLButtonElement>
  /** The timer's actions menu, rendered as the last button of the header. */
  actions?: ReactNode
  /** Remembers which milestone moments already played; this device's storage by default. */
  momentLedger?: DialMomentLedger
  /** Lets the milestone badge replay the moment. For stories only. */
  allowMomentReplay?: boolean
}>

const badgeClassName =
  "mt-3 flex items-center gap-1.5 self-start rounded-full border border-[color-mix(in_oklab,var(--dial-color)_45%,var(--border))] bg-[color-mix(in_oklab,var(--dial-color)_12%,var(--card))] px-[11px] py-[5px] text-xs font-semibold leading-4"

function MilestoneBadge(props: Readonly<{ shown: boolean; onReplay?: () => void }>) {
  const content = (
    <>
      <FlagIcon aria-hidden="true" className="size-3 text-[var(--dial-color)]" strokeWidth={2.5} />
      {formatMessage("dial.badge.reached")}
    </>
  )
  if (props.onReplay) {
    return (
      <button
        type="button"
        className={cn(
          styles.badge,
          badgeClassName,
          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:active:scale-[0.97]",
        )}
        data-shown={props.shown}
        aria-label={formatMessage("dial.badge.replay")}
        title={formatMessage("dial.badge.replay")}
        onClick={props.onReplay}
      >
        {content}
      </button>
    )
  }
  return (
    <p className={cn(styles.badge, badgeClassName)} data-shown={props.shown} data-testid="dial-milestone-badge">
      {content}
    </p>
  )
}

/** The selected timer on the dial, with its title, date line, note and milestones or reminder. */
export function DialHero({ focusButtonRef, ...props }: DialHeroProps) {
  const { timer } = props
  const nowMs = useDialNow()
  const view = dialTimerView(timer, nowMs)
  const [countFormat] = useCountUpFormat(timer.id)
  const count = dialCount(timer, view, nowMs, countFormat)
  const reminder = formatDialReminder(timer, view, nowMs)
  const trail = milestoneTrail(timer, nowMs)
  const pinned = timer.pinned === true
  const moment = useMilestoneMoment(timer, nowMs, props.momentLedger)
  const dotStyle = props.color ? ({ "--dial-color": props.color } as CSSProperties) : undefined

  return (
    <article
      className="flex min-w-0 flex-col gap-5 rounded-[16px] border border-border bg-card px-5 pb-5 pt-6 @md:px-7 @md:pb-6 @md:pt-7"
      style={dotStyle}
      data-testid="dial-hero"
      data-timer-id={timer.id}
    >
      <figure
        className="m-0 flex flex-col items-center gap-3"
        aria-label={formatMessage("dial.figure.label", {
          label: timer.label,
          value: formatDialNumber(count.value),
          unit: count.unit,
        })}
      >
        <DialFace
          progress={view.progress}
          color={props.color}
          timerKey={timer.id}
          momentRun={moment.run}
          moment={moment.phase}
          readout={{
            value: count.value,
            unit: count.unit,
            clock: view.readout.clock,
            previousValue: moment.active && !count.calendar ? Math.max(0, count.value - 1) : undefined,
            settled: moment.settled,
          }}
        />
        <figcaption className="min-h-4 text-xs leading-4 text-muted-foreground">
          {formatDialLegend(view, nowMs)}
        </figcaption>
      </figure>

      <div className="flex min-w-0 flex-col border-t border-border pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 flex min-w-0 items-center gap-2.5 text-[20px] font-semibold leading-[26px] tracking-[-0.01em]">
            <span aria-hidden="true" className="size-2 flex-none rounded-full bg-[var(--dial-color,var(--primary))]" />
            <span className="truncate">{timer.label}</span>
          </h2>
          <div className="-mr-1.5 -mt-[3px] flex flex-none items-center">
            {props.onTogglePin ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(iconButtonClassName, pinned && "text-foreground")}
                aria-label={formatMessage(pinned ? "timer.unpinAction" : "timer.pinAction")}
                aria-pressed={pinned}
                onClick={() => props.onTogglePin?.(timer)}
              >
                <PinGlyph pinned={pinned} timerId={`${timer.id}:dial`} />
              </Button>
            ) : null}
            {props.onOpenFocus ? (
              <Button
                ref={focusButtonRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                className={iconButtonClassName}
                aria-label={formatMessage("timer.focus.enter")}
                data-dial-focus-open=""
                onClick={props.onOpenFocus}
              >
                <Maximize2Icon aria-hidden="true" />
              </Button>
            ) : null}
            {props.actions}
          </div>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{formatDialDateLine(timer, view, nowMs)}</p>
        {moment.milestoneDay ? (
          <MilestoneBadge shown={moment.badgeShown} onReplay={props.allowMomentReplay ? moment.replay : undefined} />
        ) : null}
        {timer.description ? (
          <p className="mt-3 whitespace-pre-line text-sm leading-[21px] text-foreground/80">{timer.description}</p>
        ) : null}
        {trail.length > 0 ? (
          <ul aria-label={formatMessage("dial.trail.label")} className="mt-3.5 flex list-none flex-wrap gap-1.5 p-0">
            {trail.map((item) => (
              <TrailBadge key={item.key} item={item} nowMs={nowMs} />
            ))}
          </ul>
        ) : null}
        {reminder ? (
          <p className="mt-4 flex items-center gap-2 text-[13px] leading-5 text-muted-foreground">
            <BellIcon aria-hidden="true" className="size-3.5 flex-none" />
            {reminder}
          </p>
        ) : null}
      </div>
    </article>
  )
}

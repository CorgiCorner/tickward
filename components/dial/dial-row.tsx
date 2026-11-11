"use client"

import { PinIcon } from "lucide-react"
import { memo } from "react"

import { formatMessage } from "@/lib/i18n/messages"
import type { Timer } from "@/lib/types"
import { cn } from "@/lib/utils"

import { useDialNow } from "./dial-clock"
import { formatDialCaption, formatDialNumber, formatDialUnit } from "./dial-format"
import { DIAL_TICK_COUNT, dialTimerView, milestoneReachedToday } from "./dial-model"

const RING_RADIUS = 18
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** The row's small dial: how much of the big dial is lit, as a ring. */
export function DialProgressRing(props: Readonly<{ share: number; color?: string; dimmed?: boolean }>) {
  const share = Math.max(0.02, Math.min(1, Number.isFinite(props.share) ? props.share : 0))
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      className={cn("size-[34px] flex-none", props.dimmed && "opacity-55")}
      data-testid="dial-progress-ring"
    >
      <circle cx="22" cy="22" r={RING_RADIUS} fill="none" stroke="var(--border)" strokeWidth="3.5" />
      <circle
        cx="22"
        cy="22"
        r={RING_RADIUS}
        fill="none"
        stroke={props.color ?? "var(--primary)"}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH.toFixed(1)}
        strokeDashoffset={(RING_LENGTH * (1 - share)).toFixed(1)}
        transform="rotate(-90 22 22)"
      />
    </svg>
  )
}

export type DialRowProps = Readonly<{
  timer: Timer
  color?: string
  selected: boolean
  onSelect: (id: string) => void
}>

/**
 * One timer in the list. It reads the clock itself, so the second ticks here without the list
 * or its neighbours rendering again.
 */
export const DialRow = memo(function DialRow(props: DialRowProps) {
  const { timer } = props
  const nowMs = useDialNow()
  const view = dialTimerView(timer, nowMs)
  const unit = formatDialUnit(view.readout)
  const value = formatDialNumber(view.readout.value)
  const milestoneToday = milestoneReachedToday(timer, nowMs) !== null

  return (
    <button
      type="button"
      aria-pressed={props.selected}
      aria-label={formatMessage("dial.row.show", { label: timer.label, value, unit })}
      data-timer-id={timer.id}
      onClick={() => props.onSelect(timer.id)}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-[12px] border px-4 py-3 text-left outline-none transition-[scale,background-color,border-color] duration-press ease-move focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100",
        props.selected
          ? "border-[color-mix(in_oklab,var(--foreground)_40%,var(--border))] bg-muted"
          : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <DialProgressRing share={view.progress / DIAL_TICK_COUNT} color={props.color} dimmed={view.phase === "passed"} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-5">
          <span className="truncate">{timer.label}</span>
          {timer.pinned ? (
            <PinIcon
              role="img"
              aria-label={formatMessage("timer.pinned.label")}
              className="size-3 flex-none fill-current text-muted-foreground"
            />
          ) : null}
        </span>
        <span
          className={cn(
            "truncate text-xs leading-4",
            milestoneToday ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {formatDialCaption(timer, view, nowMs)}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1 tabular-nums">
        <span className="flex items-baseline gap-[5px]">
          <span className="text-2xl font-bold leading-none tracking-[-0.03em]">{value}</span>
          <span className="text-xs font-semibold leading-none text-muted-foreground">{unit}</span>
        </span>
        <span className="text-xs font-medium leading-[14px] text-muted-foreground">{view.readout.clock}</span>
      </span>
    </button>
  )
})

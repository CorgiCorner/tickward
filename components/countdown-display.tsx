"use client"

import { cn, getCountdownParts, pad2 } from "@/lib/utils"
import { formatMessage } from "@/lib/i18n/messages"

function Unit(props: Readonly<{ value: string; label: string }>) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl" suppressHydrationWarning>
        {props.value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{props.label}</div>
    </div>
  )
}

export function CountdownDisplay(
  props: Readonly<{
    targetDateIsoUtc: string
    nowMs: number
    className?: string
    muted?: boolean
  }>,
) {
  const parts = getCountdownParts(props.targetDateIsoUtc, props.nowMs)
  const muted = props.muted ?? parts.isCountUp
  const display = (
    <div className={cn("grid grid-cols-4 gap-4 sm:gap-6", muted && "text-muted-foreground", props.className)}>
      <Unit value={String(parts.days)} label={formatMessage("timer.countdown.days")} />
      <Unit value={pad2(parts.hours)} label={formatMessage("timer.countdown.hours")} />
      <Unit value={pad2(parts.minutes)} label={formatMessage("timer.countdown.minutes")} />
      <Unit value={pad2(parts.seconds)} label={formatMessage("timer.countdown.seconds")} />
    </div>
  )

  if (!parts.isCountUp) return display

  return (
    <div>
      <div className="mb-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {formatMessage("timer.countdown.since")}
      </div>
      {display}
    </div>
  )
}

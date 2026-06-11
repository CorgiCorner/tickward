"use client"

import { formatMessage } from "@/lib/i18n/messages"
import { cn, getCountdownParts, pad2 } from "@/lib/utils"

function Unit(
  props: Readonly<{
    value: string
    label: string
    className?: string
    labelClassName?: string
    valueClassName?: string
  }>,
) {
  return (
    <div className={cn("flex flex-col items-center gap-2", props.className)}>
      <div
        className={cn("text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl", props.valueClassName)}
        suppressHydrationWarning
      >
        {props.value}
      </div>
      <div className={cn("text-[10px] uppercase tracking-wide text-muted-foreground/60", props.labelClassName)}>
        {props.label}
      </div>
    </div>
  )
}

export function CountdownDisplay(
  props: Readonly<{
    targetDateIsoUtc: string
    nowMs: number
    className?: string
    unitClassName?: string
    unitLabelClassName?: string
    unitValueClassName?: string
    sinceClassName?: string
    muted?: boolean
  }>,
) {
  const parts = getCountdownParts(props.targetDateIsoUtc, props.nowMs)
  const muted = props.muted ?? parts.isCountUp
  const display = (
    <div className={cn("grid grid-cols-4 gap-4 sm:gap-6", muted && "text-muted-foreground", props.className)}>
      <Unit
        value={String(parts.days)}
        label={formatMessage("timer.countdown.days")}
        className={props.unitClassName}
        labelClassName={props.unitLabelClassName}
        valueClassName={props.unitValueClassName}
      />
      <Unit
        value={pad2(parts.hours)}
        label={formatMessage("timer.countdown.hours")}
        className={props.unitClassName}
        labelClassName={props.unitLabelClassName}
        valueClassName={props.unitValueClassName}
      />
      <Unit
        value={pad2(parts.minutes)}
        label={formatMessage("timer.countdown.minutes")}
        className={props.unitClassName}
        labelClassName={props.unitLabelClassName}
        valueClassName={props.unitValueClassName}
      />
      <Unit
        value={pad2(parts.seconds)}
        label={formatMessage("timer.countdown.seconds")}
        className={props.unitClassName}
        labelClassName={props.unitLabelClassName}
        valueClassName={props.unitValueClassName}
      />
    </div>
  )

  if (!parts.isCountUp) return display

  return (
    <div>
      <div
        className={cn(
          "mb-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
          props.sinceClassName,
        )}
      >
        {formatMessage("timer.countdown.since")}
      </div>
      {display}
    </div>
  )
}

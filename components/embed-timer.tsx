"use client"

import { useState } from "react"

import { useNow } from "@/components/use-now"
import type { EmbedAttribution } from "@/lib/embed-attribution"
import type { EmbedLayout } from "@/lib/embed-params"
import { formatMessage } from "@/lib/i18n/messages"
import { cn, formatTargetInTimeZone, getCountdownParts, pad2 } from "@/lib/utils"

export type EmbedTimerProps = Readonly<{
  label: string
  targetDateIsoUtc: string
  timezone: string
  layout: EmbedLayout
  attribution: EmbedAttribution
  accent?: string | null
  labels?: boolean
  showTarget?: boolean
  /** bg=transparent: drop card background and border. */
  transparent?: boolean
  /** Freeze the clock (stories/tests). Live 1s tick when omitted. */
  nowMs?: number
  /**
   * Clock value at mount, used to derive the transient "finished" state:
   * a countdown that crosses zero while mounted shows "finished"; a page
   * loaded after the target shows "since". Defaults to the first observed
   * clock value.
   */
  initialNowMs?: number
}>

// Sizing is fluid against the iframe viewport (the host box) via clamp()
// with vw/vmin, with per-layout minimum widths from the embed contract:
// horizontal 360px, compact 200px, square 180px; text/minimal intrinsic.

function cardClass(transparent: boolean | undefined) {
  return transparent ? "border border-transparent bg-transparent" : "border bg-card text-card-foreground"
}

function Attribution(props: Readonly<{ attribution: EmbedAttribution; className?: string }>) {
  return (
    <a
      href={props.attribution.href}
      target="_blank"
      rel="noreferrer"
      className={cn("text-[10px] leading-none text-muted-foreground/60 underline underline-offset-2", props.className)}
    >
      {props.attribution.label}
    </a>
  )
}

const UNIT_SIZE_CLASSES = {
  sm: "text-[clamp(1.125rem,9vw,1.75rem)]",
  md: "text-[clamp(1.25rem,6vw,1.875rem)]",
  lg: "text-[clamp(1.5rem,16vmin,3rem)]",
} as const

type UnitSize = keyof typeof UNIT_SIZE_CLASSES

function Unit(
  props: Readonly<{
    value: string
    label: string
    size: UnitSize
    labels: boolean
    accent?: string | null
  }>,
) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(UNIT_SIZE_CLASSES[props.size], "font-semibold leading-none tabular-nums tracking-tight")}
        style={props.accent ? { color: props.accent } : undefined}
        suppressHydrationWarning
      >
        {props.value}
      </div>
      {props.labels && (
        <div className="text-[9px] leading-none uppercase tracking-wide text-muted-foreground/60">{props.label}</div>
      )}
    </div>
  )
}

type Parts = ReturnType<typeof getCountdownParts>

function unitEntries(parts: Parts) {
  return [
    { value: String(parts.days), label: formatMessage("timer.countdown.days") },
    { value: pad2(parts.hours), label: formatMessage("timer.countdown.hours") },
    { value: pad2(parts.minutes), label: formatMessage("timer.countdown.minutes") },
    { value: pad2(parts.seconds), label: formatMessage("timer.countdown.seconds") },
  ]
}

function UnitsGrid(
  props: Readonly<{
    parts: Parts
    size: UnitSize
    labels: boolean
    accent?: string | null
    columns?: 2 | 4
    gap: string
  }>,
) {
  return (
    <div
      className={cn(
        props.columns === 2 ? "grid grid-cols-2" : "grid grid-cols-4",
        props.gap,
        props.parts.isCountUp && "text-muted-foreground",
      )}
    >
      {unitEntries(props.parts).map((unit) => (
        <Unit
          key={unit.label}
          value={unit.value}
          label={unit.label}
          size={props.size}
          labels={props.labels}
          accent={props.parts.isCountUp ? undefined : props.accent}
        />
      ))}
    </div>
  )
}

function SinceCaption(props: Readonly<{ parts: Parts }>) {
  if (!props.parts.isCountUp) return null
  return (
    <div className="text-[9px] font-medium leading-none uppercase tracking-wide text-muted-foreground">
      {formatMessage("timer.countdown.since")}
    </div>
  )
}

function FinishedLine(props: Readonly<{ size: UnitSize; accent?: string | null }>) {
  return (
    <div
      className={cn(UNIT_SIZE_CLASSES[props.size], "font-semibold leading-none tracking-tight")}
      style={props.accent ? { color: props.accent } : undefined}
    >
      {formatMessage("embed.finished")}
    </div>
  )
}

function inlineTime(parts: Parts) {
  return `${parts.days}d ${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`
}

// Coarse accessible description - days and hours only, so assistive tech is
// not flooded with per-second updates.
function coarseAriaLabel(label: string, parts: Parts, finished: boolean) {
  if (finished) return `${label}: ${formatMessage("embed.finished")}`
  const days = `${parts.days} ${formatMessage("timer.countdown.days")}`
  const hours = `${parts.hours} ${formatMessage("timer.countdown.hours")}`
  const since = parts.isCountUp ? ` ${formatMessage("timer.countdown.since").toLowerCase()}` : ""
  return `${label}: ${days} ${hours}${since}`
}

export function EmbedTimer(props: EmbedTimerProps) {
  const liveNowMs = useNow(1000)
  const nowMs = props.nowMs ?? liveNowMs
  // Captured once on mount; stable across re-renders by design.
  const [initialNowMs] = useState(() => props.initialNowMs ?? nowMs)
  const parts = getCountdownParts(props.targetDateIsoUtc, nowMs)
  const startedCounting = !getCountdownParts(props.targetDateIsoUtc, initialNowMs).isCountUp
  // Transient terminal state: only when the countdown crossed zero while
  // mounted. A page loaded after the target renders count-up ("since").
  const finished = startedCounting && parts.isCountUp

  const labels = props.labels ?? true
  const showTarget = props.showTarget ?? true
  const targetLine = formatTargetInTimeZone(props.targetDateIsoUtc, props.timezone)
  const card = cardClass(props.transparent)
  const inlineStyle = props.accent && !parts.isCountUp ? { color: props.accent } : undefined

  const inline = (size: "text" | "minimal") => (
    <div
      className={cn(
        "flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-sm",
        size === "minimal" && cn("rounded-xl px-4 py-2.5", card),
      )}
    >
      <span className="min-w-0 truncate font-medium">{props.label}</span>
      {finished ? (
        <span className="font-semibold" style={inlineStyle}>
          {formatMessage("embed.finished")}
        </span>
      ) : (
        <span
          className={cn("font-semibold tabular-nums", parts.isCountUp && "text-muted-foreground")}
          style={inlineStyle}
          suppressHydrationWarning
        >
          {inlineTime(parts)}
        </span>
      )}
      <Attribution attribution={props.attribution} />
    </div>
  )

  const content = (() => {
    switch (props.layout) {
      case "text":
        return inline("text")
      case "minimal":
        return inline("minimal")
      case "compact":
        return (
          <div className={cn("flex w-full min-w-[200px] max-w-sm flex-col items-center gap-2 rounded-xl p-4", card)}>
            <div className="max-w-full truncate text-center text-sm font-medium">{props.label}</div>
            {finished ? (
              <FinishedLine size="sm" accent={props.accent} />
            ) : (
              <>
                <SinceCaption parts={parts} />
                <UnitsGrid
                  parts={parts}
                  size="sm"
                  labels={labels}
                  accent={props.accent}
                  gap="gap-[clamp(0.5rem,3vw,1rem)]"
                />
              </>
            )}
            <Attribution attribution={props.attribution} />
          </div>
        )
      case "square":
        return (
          <div
            className={cn(
              "flex aspect-square w-[min(calc(100vw-1.5rem),calc(100dvh-1.5rem))] min-w-[180px] flex-col items-center justify-between rounded-xl p-[clamp(0.75rem,5vmin,1.5rem)]",
              card,
            )}
          >
            <div className="max-w-full truncate text-center text-sm font-medium">{props.label}</div>
            {finished ? (
              <FinishedLine size="lg" accent={props.accent} />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <SinceCaption parts={parts} />
                <UnitsGrid
                  parts={parts}
                  size="lg"
                  labels={labels}
                  accent={props.accent}
                  columns={2}
                  gap="gap-x-[clamp(1rem,7vmin,2rem)] gap-y-1"
                />
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              {showTarget && <div className="text-[10px] leading-none text-muted-foreground">{targetLine}</div>}
              <Attribution attribution={props.attribution} />
            </div>
          </div>
        )
      case "horizontal":
        return (
          <div
            className={cn("flex w-full min-w-[360px] items-center justify-between gap-6 rounded-xl px-6 py-4", card)}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{props.label}</div>
              {showTarget && (
                <div className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">{targetLine}</div>
              )}
              <Attribution attribution={props.attribution} className="mt-1 block" />
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1">
              {finished ? (
                <FinishedLine size="md" accent={props.accent} />
              ) : (
                <>
                  <SinceCaption parts={parts} />
                  <UnitsGrid
                    parts={parts}
                    size="md"
                    labels={labels}
                    accent={props.accent}
                    gap="gap-[clamp(0.75rem,3vw,1.25rem)]"
                  />
                </>
              )}
            </div>
          </div>
        )
    }
  })()

  return (
    <div role="timer" aria-label={coarseAriaLabel(props.label, parts, finished)} className="flex w-full justify-center">
      {content}
    </div>
  )
}

// Neutral card for invalid or revoked tokens. Served with HTTP 200 so it
// never surfaces an app error page inside someone's site.
export function EmbedUnavailableCard(props: Readonly<{ attribution: EmbedAttribution; layout?: EmbedLayout }>) {
  if (props.layout === "text" || props.layout === "minimal") {
    return (
      <div
        className={cn(
          "flex max-w-full flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground",
          props.layout === "minimal" && "rounded-xl border border-dashed bg-muted/40 px-4 py-2.5",
        )}
      >
        <div className="min-w-0 truncate">{formatMessage("embed.unavailable")}</div>
        <Attribution attribution={props.attribution} />
      </div>
    )
  }

  return (
    <div className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-muted/40 px-8 py-6">
      <div className="text-sm text-muted-foreground">{formatMessage("embed.unavailable")}</div>
      <Attribution attribution={props.attribution} />
    </div>
  )
}

"use client"

import { useState, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

import styles from "./dial.module.css"
import { DIAL_TICK_COUNT, dialTicks } from "./dial-model"

const RESTING_TICKS = Array.from({ length: DIAL_TICK_COUNT }, (_, index) => index)

function tickGeometry(index: number) {
  const major = index % 5 === 0
  return {
    x1: 160,
    y1: major ? 12 : 18,
    x2: 160,
    y2: major ? 44 : 40,
    transform: `rotate(${index * 6} 160 160)`,
  }
}

export type TickDialProps = Readonly<{
  /** Lit ticks, 0...60. The fraction above a whole number lights the leading tick partly. */
  progress: number
  /** Names what the dial shows. A new key sweeps the ticks in; the first one does not. */
  timerKey?: string
  /** Bumped by the milestone moment: the lit layer is drawn again. */
  momentRun?: number
  /** While true the new layer lights round slowly, for the milestone moment. */
  momentSweep?: boolean
  className?: string
}>

/**
 * Sixty ticks in a 320 box, every fifth longer. A resting layer draws all of them at 16 percent
 * of the text colour; the lit layer above draws them in the timer colour (`--dial-color`) and
 * changes only opacity, so the live second and the sweep never change layout or colour.
 */
export function TickDial(props: TickDialProps) {
  const timerKey = props.timerKey ?? ""
  const momentRun = props.momentRun ?? 0
  const [seen, setSeen] = useState({ key: timerKey, changed: false })
  if (seen.key !== timerKey) setSeen({ key: timerKey, changed: true })
  const changed = seen.key !== timerKey || seen.changed
  const motion = props.momentSweep ? "moment" : changed ? "select" : "none"

  return (
    <svg viewBox="0 0 320 320" aria-hidden="true" className={cn(styles.dial, props.className)} data-testid="tick-dial">
      <g className={styles.rest}>
        {RESTING_TICKS.map((index) => (
          <line key={index} {...tickGeometry(index)} className={styles.tick} />
        ))}
      </g>
      <g key={`${timerKey}:${momentRun}`} className={styles.lit} data-motion={motion}>
        {dialTicks(props.progress).map((tick) => (
          <line
            key={tick.index}
            {...tickGeometry(tick.index)}
            className={styles.tick}
            data-state={tick.state}
            style={{ opacity: Number(tick.share.toFixed(3)), "--tick": tick.index } as CSSProperties}
          />
        ))}
      </g>
    </svg>
  )
}

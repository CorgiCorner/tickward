"use client"

import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

import styles from "./dial.module.css"
import { DialReadout, type DialReadoutProps } from "./dial-readout"
import { TickDial } from "./tick-dial"

const SPARK_ANGLES = Array.from({ length: 12 }, (_, index) => index * 30 + 15)

/** Where the milestone moment is: the glow and sparks follow it. */
export type DialMomentPhase = "idle" | "sweep" | "bloom" | "after"

export type DialFaceProps = Readonly<{
  progress: number
  /** Any CSS colour; lit ticks, glow and sparks use it. Defaults to the primary token. */
  color?: string
  timerKey?: string
  momentRun?: number
  /** Where the milestone moment is; the ticks light round during `sweep`. */
  moment?: DialMomentPhase
  readout: DialReadoutProps
  /** Larger face for focus mode. */
  size?: "card" | "focus"
  className?: string
}>

/** The dial with its readout: ticks, number, unit, clock, and the milestone bloom behind them. */
export function DialFace(props: DialFaceProps) {
  const moment = props.moment ?? "idle"
  return (
    <div
      className={cn(styles.face, props.size === "focus" && styles.focusFace, props.className)}
      data-moment={moment === "idle" ? undefined : moment}
      style={props.color ? ({ "--dial-color": props.color } as CSSProperties) : undefined}
    >
      {moment === "idle" ? null : (
        <>
          <div aria-hidden="true" className={styles.glow} />
          {SPARK_ANGLES.map((angle) => (
            <span
              key={angle}
              aria-hidden="true"
              className={styles.spark}
              style={{ "--angle": `${angle}deg` } as CSSProperties}
            />
          ))}
        </>
      )}
      <TickDial
        progress={props.progress}
        timerKey={props.timerKey}
        momentRun={props.momentRun}
        momentSweep={moment === "sweep"}
      />
      <DialReadout {...props.readout} />
    </div>
  )
}

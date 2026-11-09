import type { CSSProperties } from "react"

import { TICK_COUNT, type DialScale } from "@/components/iphone/dial-scale"
import styles from "@/components/iphone/iphone.module.css"
import { cn } from "@/lib/utils"

// Sixty ticks drawn once; lit, leading and resting ticks differ only by CSS custom properties,
// so a change of scale animates as a sweep instead of a redraw.
export function TickDial(props: Readonly<{ scale: DialScale; className?: string; sweepIn?: boolean }>) {
  const { lit, leading } = props.scale
  return (
    <svg
      viewBox="0 0 320 320"
      aria-hidden="true"
      className={cn(styles.dial, props.sweepIn && styles.dialSweep, props.className)}
    >
      {Array.from({ length: TICK_COUNT }, (_, index) => {
        const major = index % 5 === 0
        const state = index < lit ? "lit" : index === lit ? "leading" : "rest"
        return (
          <line
            key={index}
            x1="160"
            y1={major ? 12 : 18}
            x2="160"
            y2={major ? 44 : 40}
            transform={`rotate(${index * 6} 160 160)`}
            className={styles.tick}
            data-state={state}
            style={
              {
                "--tick-index": index,
                "--tick-leading": state === "leading" ? leading.toFixed(3) : undefined,
              } as CSSProperties
            }
          />
        )
      })}
    </svg>
  )
}

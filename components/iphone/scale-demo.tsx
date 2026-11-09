"use client"

import { useEffect, useState } from "react"

import { dialScale, type DialUnit } from "@/components/iphone/dial-scale"
import styles from "@/components/iphone/iphone.module.css"
import { TickDial } from "@/components/iphone/tick-dial"
import { cn } from "@/lib/utils"

export type ScaleStop = Readonly<{
  unit: DialUnit
  seconds: number
  distance: string
}>

// The same date seen from further away and closer up. The dial plays through the stops on its
// own; choosing one stops the autoplay, and reduced motion never starts it.
export function ScaleDemo(
  props: Readonly<{
    stops: readonly ScaleStop[]
    legend: Record<string, string>
  }>,
) {
  const [index, setIndex] = useState(0)
  const [autoplay, setAutoplay] = useState(true)

  useEffect(() => {
    if (!autoplay) return
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % props.stops.length), 2_800)
    return () => window.clearInterval(timer)
  }, [autoplay, props.stops.length])

  const stop = props.stops[index]
  const scale = dialScale(stop.seconds)

  return (
    <div className={styles.scaleDemo}>
      <div className={styles.scaleDial}>
        <TickDial scale={scale} />
        <div className={styles.scaleReadout} aria-live="polite">
          <span className={styles.scaleDistance}>{stop.distance}</span>
          <span className={styles.scaleLegend}>{props.legend[scale.unit]}</span>
        </div>
      </div>
      <div className={styles.scaleStops} role="group">
        {props.stops.map((item, itemIndex) => (
          <button
            key={item.unit}
            type="button"
            aria-pressed={itemIndex === index}
            className={cn(styles.scaleStop, itemIndex === index && styles.scaleStopActive)}
            onClick={() => {
              setAutoplay(false)
              setIndex(itemIndex)
            }}
          >
            {item.distance}
          </button>
        ))}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"

import { countdownParts, dialScale } from "@/components/iphone/dial-scale"
import styles from "@/components/iphone/iphone.module.css"
import { TickDial } from "@/components/iphone/tick-dial"

// 2 days, 10 hours: inside the hour scale, so the leading tick visibly fades each second.
const DEMO_SECONDS = 2 * 86_400 + 10 * 3_600 + 29 * 60 + 22

// The hero dial ticks for real. The first render uses a fixed interval so server and client
// markup match; the countdown starts once the page is interactive.
export function LiveDial(
  props: Readonly<{
    label: string
    daysLabel: string
    legend: Record<string, string>
  }>,
) {
  const [remaining, setRemaining] = useState(DEMO_SECONDS)

  useEffect(() => {
    const target = Date.now() + DEMO_SECONDS * 1_000
    let frame = 0
    const tick = () => {
      setRemaining(Math.max(0, (target - Date.now()) / 1_000))
      frame = window.setTimeout(tick, 1_000 - (Date.now() % 1_000))
    }
    tick()
    return () => window.clearTimeout(frame)
  }, [])

  const scale = dialScale(remaining)
  const parts = countdownParts(remaining)

  return (
    <figure className={styles.liveDial} aria-label={props.label}>
      <div className={styles.liveDialFace}>
        <TickDial scale={scale} sweepIn />
        <div className={styles.liveDialReadout}>
          <span className={styles.liveDialDays}>{parts.days}</span>
          <span className={styles.liveDialUnit}>{props.daysLabel}</span>
          <span className={styles.liveDialClock}>{parts.clock}</span>
        </div>
      </div>
      <figcaption className={styles.liveDialCaption}>
        <span className={styles.liveDialLabel}>{props.label}</span>
        <span>{props.legend[scale.unit]}</span>
      </figcaption>
    </figure>
  )
}

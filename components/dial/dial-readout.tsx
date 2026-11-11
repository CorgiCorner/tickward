"use client"

import { Fragment, useLayoutEffect, useRef, useState } from "react"

import { canAnimate, FADE_EASING, MOTION_MS } from "@/components/dashboard/motion"

import styles from "./dial.module.css"
import { formatDialNumber, formatDialNumberParts } from "./dial-format"

function DialNumber(props: Readonly<{ value: number }>) {
  return (
    <>
      {formatDialNumberParts(props.value).map((part, index) =>
        part.group ? (
          <span key={index} className={styles.group}>
            {part.text}
          </span>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

export type DialReadoutProps = Readonly<{
  value: number
  unit: string
  clock: string
  /** The number the count rolls from during the milestone moment. */
  previousValue?: number
  /** False while the previous number still shows. */
  settled?: boolean
}>

type Shown = { value: number; unit: string }

/**
 * A new count format (total days or years, months and days) changes the unit: the old number
 * and unit fade out (160 ms) while the new ones fade in (220 ms), as on the card and the detail
 * view. Opacity and blur only, so reduced motion keeps it.
 */
function useFormatCrossfade(value: number, unit: string) {
  const [outgoing, setOutgoing] = useState<(Shown & { id: number }) | null>(null)
  const last = useRef<Shown>({ value, unit })
  const incoming = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const previous = last.current
    last.current = { value, unit }
    const element = incoming.current
    if (previous.unit === unit || !canAnimate(element)) return
    setOutgoing({ ...previous, id: Date.now() })
    element.animate(
      [
        { opacity: 0, filter: "blur(4px)" },
        { opacity: 1, filter: "blur(0)" },
      ],
      { duration: MOTION_MS.enter, easing: FADE_EASING },
    )
    const done = globalThis.setTimeout(() => setOutgoing(null), MOTION_MS.exit)
    return () => globalThis.clearTimeout(done)
    // `value` changes every day; only a new unit is a new format.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit])

  return { outgoing, incoming }
}

function FadingOut(props: Readonly<Shown & { long: boolean }>) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!canAnimate(element)) return
    const fade = element.animate(
      [
        { opacity: 1, filter: "blur(0)" },
        { opacity: 0, filter: "blur(4px)" },
      ],
      { duration: MOTION_MS.exit, easing: FADE_EASING, fill: "forwards" },
    )
    return () => fade.cancel()
  }, [])
  return (
    <span ref={ref} className={styles.countLayer} data-format="out" aria-hidden="true">
      <span className={styles.number} data-long={props.long}>
        <span className={styles.numberLayer}>
          <DialNumber value={props.value} />
        </span>
      </span>
      <span className={styles.unit}>{props.unit}</span>
    </span>
  )
}

/**
 * The stacked readout in the middle of the dial: number, unit, clock. Sizes follow the face
 * (`--face`), so the same readout serves the card and focus mode. Tabular figures keep the
 * width still while the clock runs.
 */
export function DialReadout(props: DialReadoutProps) {
  const settled = props.settled ?? true
  const long = formatDialNumber(Math.max(props.value, props.previousValue ?? 0)).length > 3
  const rolling = props.previousValue !== undefined && props.previousValue !== props.value
  const { outgoing, incoming } = useFormatCrossfade(props.value, props.unit)
  return (
    <div className={styles.readout} data-testid="dial-readout">
      <span className={styles.count}>
        <span ref={incoming} className={styles.countLayer} data-format="in">
          <span className={styles.number} data-long={long}>
            <span className={styles.numberLayer} data-role="now" data-shown={settled || !rolling}>
              <DialNumber value={props.value} />
            </span>
            {rolling ? (
              <span className={styles.numberLayer} data-role="was" data-shown={!settled} aria-hidden="true">
                <DialNumber value={props.previousValue!} />
              </span>
            ) : null}
          </span>
          <span className={styles.unit}>{props.unit}</span>
        </span>
        {outgoing ? (
          <FadingOut
            key={outgoing.id}
            value={outgoing.value}
            unit={outgoing.unit}
            long={formatDialNumber(outgoing.value).length > 3}
          />
        ) : null}
      </span>
      <span className={styles.clock}>{props.clock}</span>
    </div>
  )
}

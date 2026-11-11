"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { canAnimate, MOTION_MS, MOVE_EASING, prefersReducedMotion } from "@/components/dashboard/motion"
import { cn } from "@/lib/utils"

// Height plus opacity, 220 ms, on the app's move curve. With reduced motion the
// height snaps and only the fade remains.
const REVEAL_TRANSITION =
  "grid transition-[grid-template-rows,opacity] duration-enter ease-move motion-reduce:transition-opacity motion-reduce:ease-fade"

// The inner box clips the growing row; the 3px bleed keeps focus rings of the
// controls inside it visible.
const REVEAL_INNER = "-m-[3px] min-h-0 overflow-hidden p-[3px]"

/**
 * A region that stays mounted and opens or closes in place, for a disclosure the
 * person toggles. Closed content is inert, so it is skipped by focus and by
 * assistive technology.
 */
export function Collapsible(props: Readonly<{ open: boolean; id?: string; className?: string; children: ReactNode }>) {
  return (
    <div
      id={props.id}
      data-state={props.open ? "open" : "closed"}
      aria-hidden={!props.open}
      inert={!props.open}
      className={cn(
        REVEAL_TRANSITION,
        props.open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 duration-exit",
      )}
    >
      <div className={REVEAL_INNER}>
        <div className={props.className}>{props.children}</div>
      </div>
    </div>
  )
}

/**
 * A row that appears because of another choice (for example the timer
 * direction). It mounts already transitioning from its starting style, and it
 * leaves at once, so exits stay faster than entries.
 */
export function RevealRow(props: Readonly<{ className?: string; outerClassName?: string; children: ReactNode }>) {
  return (
    <div
      data-reveal-row
      className={cn(
        REVEAL_TRANSITION,
        "grid-rows-[1fr] opacity-100 starting:grid-rows-[0fr] starting:opacity-0",
        props.outerClassName,
      )}
    >
      <div className={REVEAL_INNER}>
        <div className={props.className}>{props.children}</div>
      </div>
    </div>
  )
}

/**
 * A row that opens in place when `open` turns on (height plus opacity, 220 ms)
 * and closes in place when it turns off (160 ms) before it unmounts, so it never
 * pops. Closed content leaves the DOM.
 */
export function PresenceRow(
  props: Readonly<{ open: boolean; className?: string; outerClassName?: string; children: ReactNode }>,
) {
  const [present, setPresent] = useState(props.open)
  if (props.open && !present) setPresent(true)

  useEffect(() => {
    if (props.open) return
    const id = globalThis.setTimeout(() => setPresent(false), MOTION_MS.exit)
    return () => globalThis.clearTimeout(id)
  }, [props.open])

  if (!present) return null
  return (
    <div
      data-reveal-row
      data-state={props.open ? "open" : "closed"}
      aria-hidden={!props.open || undefined}
      inert={!props.open}
      className={cn(
        REVEAL_TRANSITION,
        props.open
          ? "grid-rows-[1fr] opacity-100 starting:grid-rows-[0fr] starting:opacity-0"
          : "grid-rows-[0fr] opacity-0 duration-exit",
        props.outerClassName,
      )}
    >
      <div className={REVEAL_INNER}>
        <div className={props.className}>{props.children}</div>
      </div>
    </div>
  )
}

/** A short message that fades in when it appears or when its text changes. */
export function FadeInText(
  props: Readonly<{ className?: string; children: ReactNode; role?: "status" | "alert"; id?: string }>,
) {
  return (
    <p
      id={props.id}
      role={props.role}
      className={cn("opacity-100 transition-opacity duration-enter ease-fade starting:opacity-0", props.className)}
    >
      {props.children}
    </p>
  )
}

/**
 * Follows the height of its content: when the content grows or shrinks (a hint
 * whose text changes from one line to two), the box eases to the new height
 * instead of jumping, 220 ms when it grows and 160 ms when it shrinks. A change
 * mid-way starts from the height on screen. With reduced motion the height
 * snaps; the content's own fade stays.
 */
export function SmoothHeight(props: Readonly<{ className?: string; children: ReactNode }>) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const box = outer.current
    const content = inner.current
    if (!box || !content || typeof ResizeObserver === "undefined") return
    let last = content.offsetHeight
    let running: Animation | null = null
    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight
      const from = running ? box.getBoundingClientRect().height : last
      last = next
      if (Math.abs(from - next) < 0.5 || !canAnimate(box) || prefersReducedMotion()) return
      running?.cancel()
      const animation = box.animate([{ height: `${from}px` }, { height: `${next}px` }], {
        duration: next > from ? MOTION_MS.enter : MOTION_MS.exit,
        easing: MOVE_EASING,
      })
      running = animation
      animation.onfinish = () => {
        if (running === animation) running = null
      }
    })
    observer.observe(content)
    return () => {
      observer.disconnect()
      running?.cancel()
    }
  }, [])

  return (
    <div ref={outer} data-smooth-height="" className={cn("overflow-hidden", props.className)}>
      <div ref={inner}>{props.children}</div>
    </div>
  )
}

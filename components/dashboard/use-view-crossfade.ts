"use client"

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { canAnimate, FADE_EASING, MOTION_MS, MOVE_EASING, prefersReducedMotion } from "@/components/dashboard/motion"

/** How far the incoming layout rises while it fades in. */
export const VIEW_CROSSFADE_TRAVEL_PX = 6

function currentOpacity(element: Element) {
  const value = Number.parseFloat(getComputedStyle(element).opacity)
  return Number.isFinite(value) ? value : 1
}

/**
 * Swaps what `root` shows as one continuous action: the current layout fades
 * out (160 ms), the next one is rendered while nothing is visible and fades in
 * (220 ms) rising a few pixels. Returns the value to render, which lags `value`
 * by the fade-out. It is interruptible: another change mid-way continues from
 * the opacity on screen, and going back cancels the swap. Reduced motion keeps
 * the fades and drops the rise. Focus is never touched, so it stays on the
 * control that asked for the change.
 */
export function useViewCrossfade<T>(value: T, root: RefObject<HTMLElement | null>): T {
  const [shown, setShown] = useState(value)
  const animation = useRef<Animation | null>(null)
  const phase = useRef<"idle" | "out" | "in">("idle")
  const previousShown = useRef(shown)

  // A new value: fade the current layout out, then render the next one.
  useLayoutEffect(() => {
    const element = root.current
    if (value === shown) {
      // Back to what is on screen before the swap happened: fade it back in.
      if (phase.current === "out" && canAnimate(element)) fadeIn(element, currentOpacity(element))
      return
    }
    if (!canAnimate(element)) {
      setShown(value)
      return
    }
    const from = currentOpacity(element)
    animation.current?.cancel()
    phase.current = "out"
    const out = element.animate([{ opacity: from }, { opacity: 0 }], {
      // A layout that is already half gone needs only the rest of the time.
      duration: MOTION_MS.exit * from,
      easing: FADE_EASING,
      fill: "forwards",
    })
    animation.current = out
    out.onfinish = () => {
      if (animation.current === out) setShown(value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new value starts a swap
  }, [value])

  // The next layout is on the page: fade it in.
  useLayoutEffect(() => {
    if (previousShown.current === shown) return
    previousShown.current = shown
    const element = root.current
    if (canAnimate(element)) fadeIn(element, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per swap
  }, [shown])

  function fadeIn(element: Element, from: number) {
    animation.current?.cancel()
    phase.current = "in"
    const travel = prefersReducedMotion() ? 0 : VIEW_CROSSFADE_TRAVEL_PX * (1 - from)
    const fade = element.animate(
      [
        { opacity: from, transform: `translateY(${travel}px)` },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: MOTION_MS.enter,
        easing: travel === 0 ? FADE_EASING : MOVE_EASING,
      },
    )
    animation.current = fade
    fade.onfinish = () => {
      if (animation.current === fade) {
        animation.current = null
        phase.current = "idle"
      }
    }
  }

  return shown
}

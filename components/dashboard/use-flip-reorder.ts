"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react"

import { MOTION_MS, MOVE_EASING, prefersReducedMotion } from "@/components/dashboard/motion"

// FLIP for the timer list: when the order changes (sort mode, pin, Move earlier
// or later, a filter), every card that stays on screen glides from where it was
// to where it is now. Cards are found by `data-flip-key`. Positions are kept in
// document coordinates so scrolling between two renders does not count as a move.

export const FLIP_DURATION_MS = MOTION_MS.move
export const FLIP_EASING = MOVE_EASING

type Point = { x: number; y: number }

function measure(root: HTMLElement) {
  const points = new Map<string, Point>()
  const elements = new Map<string, HTMLElement>()
  for (const element of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
    const key = element.dataset.flipKey
    if (!key) continue
    const rect = element.getBoundingClientRect()
    points.set(key, { x: rect.left + globalThis.scrollX, y: rect.top + globalThis.scrollY })
    elements.set(key, element)
  }
  return { points, elements }
}

// Typing into a field (Quick Add, search) never reorders the list by itself, and
// measuring every card on each keystroke is what makes typing lag on a long list.
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.matches("input, textarea, select")
}

/**
 * Animates cards inside `root` to their new place whenever `orderKey` changes.
 * Returns `skipNext`: call it before an order change that is already on screen
 * (a finished drag), so the cards do not replay the move.
 */
export function useFlipReorder(root: RefObject<HTMLElement | null>, orderKey: string) {
  const points = useRef<Map<string, Point>>(new Map())
  const lastKey = useRef(orderKey)
  const skip = useRef(false)

  // Measures only when the order changed (and once on mount): other renders of the
  // list, such as typing in Quick Add, leave the cards where they are. Runs after
  // every commit so that a skip whose change turned out to be a no-op (the order
  // came out the same) is dropped instead of swallowing the next real reorder.
  const measured = useRef(false)
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const changed = lastKey.current !== orderKey
    if (measured.current && !changed) {
      skip.current = false
      return
    }
    measured.current = true
    const next = measure(element)
    if (changed && !skip.current && !prefersReducedMotion() && typeof Element.prototype.animate === "function") {
      for (const [key, target] of next.points) {
        const from = points.current.get(key)
        const card = next.elements.get(key)
        if (!from || !card) continue
        const dx = from.x - target.x
        const dy = from.y - target.y
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
        card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
          duration: FLIP_DURATION_MS,
          easing: FLIP_EASING,
        })
      }
    }
    skip.current = false
    lastKey.current = orderKey
    points.current = next.points
  })

  // Cards change size between renders of the list (a live counter, a reminder
  // line, a resize), so the last positions can be stale. Every order change
  // starts with a pointer or key press: measure again right then, but not for
  // keys typed into a field or held down. Enter is the exception: in a field it
  // submits (Quick Add inserts a card), so it measures too.
  useEffect(() => {
    const refresh = () => {
      if (root.current) points.current = measure(root.current).points
    }
    const refreshOnKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      const submits = event.key === "Enter" && !event.isComposing
      if (!submits && isTypingTarget(event.target)) return
      refresh()
    }
    globalThis.addEventListener("resize", refresh)
    document.addEventListener("pointerdown", refresh, true)
    document.addEventListener("keydown", refreshOnKey, true)
    return () => {
      globalThis.removeEventListener("resize", refresh)
      document.removeEventListener("pointerdown", refresh, true)
      document.removeEventListener("keydown", refreshOnKey, true)
    }
  }, [root])

  return useCallback(() => {
    skip.current = true
  }, [])
}

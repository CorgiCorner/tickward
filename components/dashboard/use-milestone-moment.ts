"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  localMomentLedger,
  momentKey,
  type MomentLedger,
  type MomentSurface,
} from "@/components/dashboard/milestone-moment-ledger"
import { MOTION_MS } from "@/components/dashboard/motion"
import type { MilestoneOccurrence } from "@/lib/milestones"

// The milestone moment on a card and in the detail view: on a milestone day, the first time
// the surface shows the timer, the count rolls from yesterday's number to today's, the bar
// closes and the badge arrives, about half a second in all. Only `before` -> `done` is
// modelled here; CSS transitions do the rest (see MILESTONE_MOMENT in timer-card-parts), so
// the moment stays interruptible and reduced motion keeps only the fades. The dial plays its
// own longer version (components/dial/milestone-moment.ts) from the same ledger.

export type MilestoneMomentPhase = "before" | "done"

export function useMilestoneMoment(
  surface: MomentSurface,
  timerId: string,
  reached: Pick<MilestoneOccurrence, "unit" | "count"> | null,
  ledger: MomentLedger = localMomentLedger,
) {
  const key = reached ? momentKey(surface, timerId, reached) : null
  const [phase, setPhase] = useState<MilestoneMomentPhase>(() =>
    key && globalThis.window !== undefined && !ledger.has(key) ? "before" : "done",
  )
  const [playId, setPlayId] = useState(0)
  // True while yesterday's number is still needed for the roll; afterwards only today's stays.
  const [rolling, setRolling] = useState(phase === "before")
  // The key this mount claimed: a strict re-run of the effect plays it again instead of
  // finding it already claimed.
  const claimed = useRef<string | null>(null)
  const replaying = useRef(false)

  useEffect(() => {
    if (!key) return
    let frame = 0
    if (phase === "done") {
      // A new milestone value on a mounted card (the day turned): play it if it has not played.
      if (claimed.current === key || ledger.has(key)) return
      frame = requestAnimationFrame(() => {
        setRolling(true)
        setPhase("before")
      })
      return () => cancelAnimationFrame(frame)
    }
    if (!replaying.current && claimed.current !== key) {
      if (!ledger.claim(key, Date.now())) {
        frame = requestAnimationFrame(() => setPhase("done"))
        return () => cancelAnimationFrame(frame)
      }
      claimed.current = key
    }
    replaying.current = false
    // Two frames: the `before` state must be painted before the transitions start.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase("done"))
    })
    return () => cancelAnimationFrame(frame)
  }, [key, ledger, phase, playId])

  // Once the roll has run, only today's number stays on the page.
  useEffect(() => {
    if (phase !== "done" || !rolling) return
    const id = globalThis.setTimeout(() => setRolling(false), MOTION_MS.move + 40)
    return () => globalThis.clearTimeout(id)
  }, [phase, rolling])

  const replay = useCallback(() => {
    replaying.current = true
    setRolling(true)
    setPhase("before")
    setPlayId((id) => id + 1)
  }, [])

  return { phase: key ? phase : "done", rolling: key !== null && rolling, replay } as const
}

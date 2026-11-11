"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  createLocalMomentLedger,
  createMemoryMomentLedger,
  localMomentLedger,
  momentKey,
  type MomentLedger,
} from "@/components/dashboard/milestone-moment-ledger"
import { prefersReducedMotion } from "@/components/dashboard/motion"
import type { Timer } from "@/lib/types"

import type { DialMomentPhase } from "./dial-face"
import { milestoneReachedToday } from "./dial-model"

// The milestone moment: on the day a count-up reaches a milestone, the first time the dial
// shows it, the ticks light round again, the dial blooms with a soft glow and sparks, the count
// rolls to the milestone and the badge arrives last. About two seconds, once per timer and
// milestone value. With reduced motion only the count and the badge fade.

/** Remembers which moments already played: the ledger the card and the detail view use too. */
export type DialMomentLedger = MomentLedger
export { createLocalMomentLedger, createMemoryMomentLedger, localMomentLedger }

/** Milliseconds from the start of the moment. */
export const MOMENT_TIMELINE = { start: 0, bloom: 1_240, badge: 1_580, end: 2_160 } as const
export const CALM_MOMENT_TIMELINE = { start: 0, bloom: 60, badge: 300, end: 600 } as const

export type DialMomentState = Readonly<{
  /** Bumped at each play; the dial replays its round for a new value. */
  run: number
  /** The ticks are lighting round again. */
  sweeping: boolean
  phase: DialMomentPhase
  /** True from just before the moment until it ends: the previous count is drawn. */
  active: boolean
  /** False while the count still shows the number before the milestone. */
  settled: boolean
  /** The "Milestone reached" badge is in. */
  badgeShown: boolean
  /** True on the milestone day, when the badge belongs on the card. */
  milestoneDay: boolean
  /** Plays the moment again (stories only). */
  replay: () => void
}>

type Playing = {
  timerId: string
  run: number
  phase: DialMomentPhase
  settled: boolean
  badge: boolean
  done: boolean
}

export function useMilestoneMoment(
  timer: Timer,
  nowMs: number,
  ledger: DialMomentLedger = localMomentLedger,
): DialMomentState {
  const reached = milestoneReachedToday(timer, nowMs)
  const key = reached ? momentKey("dial", timer.id, reached) : null
  const [playing, setPlaying] = useState<Playing | null>(null)
  const timeouts = useRef<number[]>([])
  const runs = useRef(0)
  const claimed = useRef<string | null>(null)
  const finished = useRef<string | null>(null)

  const clear = useCallback(() => {
    for (const id of timeouts.current) globalThis.clearTimeout(id)
    timeouts.current = []
  }, [])

  const play = useCallback(
    (timerId: string, momentKey: string | null) => {
      clear()
      const calm = prefersReducedMotion()
      const timeline = calm ? CALM_MOMENT_TIMELINE : MOMENT_TIMELINE
      // With reduced motion the ticks stay put, so the dial keeps its layer.
      if (!calm) runs.current += 1
      const run = calm ? 0 : runs.current
      const at = (ms: number, next: Omit<Playing, "timerId" | "run">, done = false) => {
        const id = globalThis.setTimeout(() => {
          if (done && momentKey) finished.current = momentKey
          setPlaying({ timerId, run, ...next })
        }, ms)
        timeouts.current.push(id as unknown as number)
      }
      at(timeline.start, { phase: calm ? "idle" : "sweep", settled: false, badge: false, done: false })
      at(timeline.bloom, { phase: calm ? "idle" : "bloom", settled: true, badge: false, done: false })
      at(timeline.badge, { phase: calm ? "idle" : "after", settled: true, badge: true, done: false })
      at(timeline.end, { phase: "idle", settled: true, badge: true, done: true }, true)
    },
    [clear],
  )

  useEffect(() => {
    if (!key || finished.current === key) return
    // A moment claimed by this mount and cut short (another timer was picked, or a strict
    // re-run of the effect) plays again from the start; one claimed elsewhere never does.
    if (claimed.current !== key) {
      if (!ledger.claim(key, Date.now())) return
      claimed.current = key
    }
    play(timer.id, key)
    return clear
  }, [clear, key, ledger, play, timer.id])

  const current = playing?.timerId === timer.id ? playing : null
  // Before the first frame of a moment that has not played, the count and badge wait for it.
  const pending = key !== null && current === null && !ledger.has(key)
  return {
    run: current?.run ?? 0,
    sweeping: current?.phase === "sweep",
    phase: current?.phase ?? "idle",
    active: pending || (current !== null && !current.done),
    settled: current ? current.settled : !pending,
    badgeShown: current ? current.badge : !pending,
    milestoneDay: reached !== null,
    replay: () => play(timer.id, null),
  }
}

"use client"

import { createContext, useContext, useSyncExternalStore, type PropsWithChildren } from "react"

import { nowSnapshot, subscribeToNow } from "@/lib/now-ticker.client"

// Where the dial view reads the time. By default it is the app's shared one-second ticker, so
// the dial, the cards and the browser title tick together. Stories and tests pass their own
// clock: a fixed instant, or one that starts at a chosen date and runs.

export type DialClock = Readonly<{
  subscribe: (listener: () => void) => () => void
  now: () => number
}>

export const appDialClock: DialClock = { subscribe: subscribeToNow, now: nowSnapshot }

/** A clock that never moves. */
export function fixedDialClock(nowMs: number): DialClock {
  return { subscribe: () => () => undefined, now: () => nowMs }
}

/** A clock that reads `startMs` when created and then runs with the app's ticker. */
export function offsetDialClock(startMs: number): DialClock {
  const offset = startMs - Date.now()
  return { subscribe: subscribeToNow, now: () => nowSnapshot() + offset }
}

const DialClockContext = createContext<DialClock>(appDialClock)

export function DialClockProvider(props: Readonly<PropsWithChildren<{ clock: DialClock }>>) {
  return <DialClockContext.Provider value={props.clock}>{props.children}</DialClockContext.Provider>
}

/**
 * The current time, rounded down to `resolutionMs`. A component re-renders only when the
 * rounded value changes, so a list can follow the minute while its rows follow the second.
 */
export function useDialNow(resolutionMs = 1_000): number {
  const clock = useContext(DialClockContext)
  const read = () => Math.floor(clock.now() / resolutionMs) * resolutionMs
  return useSyncExternalStore(clock.subscribe, read, read)
}

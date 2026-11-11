"use client"

import { useSyncExternalStore } from "react"

import { nowSnapshot, subscribeToNow } from "@/lib/now-ticker.client"

function minuteSnapshot() {
  return Math.floor(nowSnapshot() / 60_000) * 60_000
}

/**
 * The current time rounded down to the minute. It shares the one-second ticker
 * but re-renders its caller only when the minute changes, which is enough for
 * date lines, reminders and milestone days.
 */
export function useMinuteNow() {
  return useSyncExternalStore(subscribeToNow, minuteSnapshot, minuteSnapshot)
}

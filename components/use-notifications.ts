"use client"

import { useLocalTimerAlarms } from "@/components/use-local-timer-alarms"
import type { Timer } from "@/lib/types"

export function useTimerNotifications(timers: Timer[], nowMs: number) {
  useLocalTimerAlarms(timers, nowMs)
}

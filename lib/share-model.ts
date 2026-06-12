import type { Timer } from "@/lib/types"
import { effectiveTargetDate } from "@/lib/utils"

export type SharedTimerSnapshot = {
  label: string
  targetDate: string
  timezone: string
  color?: string
  description?: string
  refreshOnFinish?: boolean
  sharedAt: string
}

export type ShareRecord = {
  timerId: string
  sharedAt: string
}

export type ResolvedShare = {
  resolvedFrom: "live"
  timer: Omit<SharedTimerSnapshot, "sharedAt"> & { sharedAt?: string }
}

export { isRoutableShareId, isValidRestoreKey, isValidShareId } from "@/lib/identifiers"

export function sharedTimerFromTimer(timer: Timer, sharedAt?: string, nowMs = Date.now()): ResolvedShare["timer"] {
  return {
    label: timer.label,
    targetDate: effectiveTargetDate(timer, nowMs),
    timezone: timer.timezone,
    color: timer.color,
    description: timer.description,
    ...(timer.recurrence?.enabled ? { refreshOnFinish: true } : {}),
    sharedAt,
  }
}

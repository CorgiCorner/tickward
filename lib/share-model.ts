import type { Timer } from "@/lib/types"

export type SharedTimerSnapshot = {
  label: string
  targetDate: string
  timezone: string
  color?: string
  description?: string
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

export function sharedTimerFromTimer(timer: Timer, sharedAt?: string): ResolvedShare["timer"] {
  return {
    label: timer.label,
    targetDate: timer.targetDate,
    timezone: timer.timezone,
    color: timer.color,
    description: timer.description,
    sharedAt,
  }
}

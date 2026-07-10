import type { Space, Timer } from "@/lib/types"
import { effectiveTargetDate } from "@/lib/utils"

export type SharedTimerSnapshot = {
  label: string
  targetDate: string
  timezone: string
  createdAt?: string
  color?: string
  spaceName?: string
  spaceColor?: string
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

export function sharedTimerFromTimer(
  timer: Timer,
  sharedAt?: string,
  nowMs = Date.now(),
  space?: Pick<Space, "name" | "color"> | null,
): ResolvedShare["timer"] {
  return {
    label: timer.label,
    targetDate: effectiveTargetDate(timer, nowMs),
    timezone: timer.timezone,
    createdAt: timer.createdAt,
    color: timer.color,
    ...(space?.name ? { spaceName: space.name } : {}),
    ...(space?.color ? { spaceColor: space.color } : {}),
    description: timer.description,
    ...(timer.recurrence?.enabled ? { refreshOnFinish: true } : {}),
    sharedAt,
  }
}

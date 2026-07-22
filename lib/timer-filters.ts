import { timerNotificationsEnabled } from "@/lib/notification-preferences"
import type { Timer, TimerFilterKey, TimerFilterType, TimerFilters } from "@/lib/types"
import { effectiveTargetDate } from "@/lib/utils"

export function timerHasNotifications(timer: Timer) {
  return timerNotificationsEnabled(timer.notification, timer.notify)
}

export function timerIsMuted(timer: Timer) {
  return !timerHasNotifications(timer)
}

export function timerIsShared(timer: Timer) {
  return Boolean(timer.sharedAt ?? timer.sourceShareId)
}

export function timerIsRecurring(timer: Timer) {
  return timer.recurrence?.enabled === true
}

export function timerFilterType(timer: Timer, nowMs = Date.now()): Exclude<TimerFilterType, "all"> {
  if (timer.mode === "since") return "countUp"
  const targetAtMs = new Date(effectiveTargetDate(timer, nowMs)).getTime()
  const createdAtMs = new Date(timer.createdAt).getTime()

  // A timer created after its target has never crossed zero while Tickward was
  // tracking it. It belongs in the Past countdown section, rather than the
  // Count up workflow. Treating it as Count up hid a newly-created past timer
  // whenever the Countdown filter was active, despite confirming creation.
  if (!Number.isFinite(targetAtMs) || targetAtMs >= nowMs || targetAtMs < createdAtMs) return "countdown"
  return "countUp"
}

export function timerMatchesType(timer: Timer, type: TimerFilterType, nowMs = Date.now()) {
  return type === "all" || timerFilterType(timer, nowMs) === type
}

export function timerMatchesFilterKey(timer: Timer, filter: TimerFilterKey) {
  if (filter === "pinned") return timer.pinned === true
  if (filter === "muted") return timerIsMuted(timer)
  if (filter === "shared") return timerIsShared(timer)
  return timerIsRecurring(timer)
}

export function timerMatchesFilters(timer: Timer, filters: TimerFilters, nowMs = Date.now()) {
  if (!timerMatchesType(timer, filters.type, nowMs)) return false
  if (filters.pinned && !timerMatchesFilterKey(timer, "pinned")) return false
  if (filters.muted && !timerMatchesFilterKey(timer, "muted")) return false
  if (filters.shared && !timerMatchesFilterKey(timer, "shared")) return false
  if (filters.recurring && !timerMatchesFilterKey(timer, "recurring")) return false
  return true
}

export function timerTypeFilterCount(timers: Timer[], type: TimerFilterType, nowMs = Date.now()) {
  return timers.filter((timer) => timerMatchesType(timer, type, nowMs)).length
}

export function timerToggleFilterCount(
  timers: Timer[],
  filter: TimerFilterKey,
  type: TimerFilterType = "all",
  nowMs = Date.now(),
) {
  return timers.filter((timer) => timerMatchesType(timer, type, nowMs) && timerMatchesFilterKey(timer, filter)).length
}

export function activeTimerFilterCount(filters: TimerFilters) {
  return (
    Number(filters.type !== "all") +
    Number(filters.pinned) +
    Number(filters.muted) +
    Number(filters.shared) +
    Number(filters.recurring)
  )
}

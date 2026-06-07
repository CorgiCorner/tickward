import type { Timer, TimerFilters } from "@/lib/types"

export function timerHasNotifications(timer: Timer) {
  return (timer.notification?.enabled ?? timer.notify) === true
}

export function timerIsShared(timer: Timer) {
  return Boolean(timer.sharedAt || timer.sourceShareId)
}

export function timerMatchesFilters(timer: Timer, filters: TimerFilters) {
  if (filters.notifications && !timerHasNotifications(timer)) return false
  if (filters.shared && !timerIsShared(timer)) return false
  return true
}

export function activeTimerFilterCount(filters: TimerFilters) {
  return Number(filters.notifications) + Number(filters.shared)
}

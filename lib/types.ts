import type { TimerNotificationSettings } from "@/lib/notification-preferences"

export type Timer = {
  id: string
  label: string
  targetDate: string
  timezone: string
  createdAt: string
  updatedAt?: string
  archivedAt?: string
  color?: string
  sharedAt?: string
  sourceShareId?: string
  lastSyncAt?: string
  notify?: boolean
  notification?: TimerNotificationSettings
  pinned?: boolean
  recurrence?: {
    // Loops on a calendar cadence/slot, anchored to the set date (targetDate).
    // The slot (time, weekday, day-of-month, month) is read from targetDate in
    // `timezone`; `lastDay` overrides monthly day to the last day of the month.
    type: "daily" | "weekly" | "monthly" | "yearly"
    enabled: boolean
    lastDay?: boolean
  }
  description?: string
  spaceId?: string
  image?: {
    unsplashId: string
    url: string
    thumbUrl: string
    authorName: string
    authorUrl: string
  }
}

export type Space = {
  id: string // nanoid(8)
  name: string // max 30 chars
  color?: string
  createdAt: string
}

export const MAX_SPACES = 2
export const UNASSIGNED_SPACE_ID = "__unassigned"

export type TimerSortMode = "manual" | "soonest" | "latest" | "name_asc" | "recently_added"
export type TimerFilterKey = "notifications" | "shared"
export type TimerFilters = Record<TimerFilterKey, boolean>

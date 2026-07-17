import type { TimerNotificationSettings } from "@/lib/notification-preferences"
import type { TimerAfterZero } from "@/lib/count-up-policy"
import type { MilestoneRule } from "@/lib/milestones"

export type TimerReminder = {
  offsetMinutes: number
}

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
  afterZero?: TimerAfterZero
  // "until" (default) counts down to targetDate; "since" counts up from it
  // (the anchor) and celebrates derived milestones. Mutually exclusive with
  // recurrence and afterZero — see lib/milestones.ts for the derivation.
  mode?: "until" | "since"
  milestones?: {
    rules: MilestoneRule[]
  }
  recurrence?: {
    // Loops on a calendar cadence/slot, anchored to the set date (targetDate).
    // The slot (time, weekday, day-of-month, month) is read from targetDate in
    // `timezone`; `lastDay` overrides monthly day to the last day of the month.
    type: "daily" | "weekly" | "monthly" | "yearly"
    enabled: boolean
    lastDay?: boolean
  }
  reminders?: TimerReminder[]
  description?: string
  url?: string
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
  id: string // opaque public id; new ids are prefixed (space_...)
  name: string // max 30 chars
  color?: string
  createdAt: string
}

export const UNASSIGNED_SPACE_ID = "__unassigned"

export type TimerSortMode = "manual" | "soonest" | "latest" | "name_asc" | "recently_added"
export type TimerFilterType = "all" | "countdown" | "countUp"
export type TimerFilterKey = "pinned" | "muted" | "shared" | "recurring"
export type TimerFilters = { type: TimerFilterType } & Record<TimerFilterKey, boolean>

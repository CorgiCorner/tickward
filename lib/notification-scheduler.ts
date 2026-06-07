// v0.2 notification scheduler port.
//
// Services depend on this interface instead of a concrete scheduler so a future
// durable backend can deliver timer notifications without touching domain or
// API code. This module is type-only at the boundary and safe to import
// anywhere; it performs no IO and reads no environment.
//
// Wire-format note: the command carries `targetDate` (ISO string) plus
// `timezone`, matching the Timer contract. Renaming to `targetAt` would break
// alignment with stored payloads, so the port keeps the existing field names.

import type { NotificationChannel, NotificationPresentation } from "@/lib/notification-preferences"

export type ScheduleTimerNotificationCommand = {
  timerId: string
  label: string
  targetDate: string
  timezone: string
  channels?: NotificationChannel[]
  presentation?: NotificationPresentation
}

export interface NotificationScheduler {
  scheduleTimerNotification(command: ScheduleTimerNotificationCommand): Promise<void>
  cancelTimerNotification(timerId: string): Promise<void>
}

/**
 * Default scheduler that does nothing. A Temporal-backed adapter replaces this
 * later behind the same port; private deployments may override it via an
 * extension point in a future commit.
 */
export const noopNotificationScheduler: NotificationScheduler = {
  async scheduleTimerNotification(): Promise<void> {},
  async cancelTimerNotification(): Promise<void> {},
}

export function getNotificationScheduler(): NotificationScheduler {
  return noopNotificationScheduler
}

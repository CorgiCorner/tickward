import "server-only"

import type { DeliveryResult, NotificationRecipient } from "@/lib/notification-delivery"
import { NOTIFICATION_WORKFLOWS } from "@/lib/notification-outbox.server"
import type { NotificationOutboxRepository } from "@/lib/notification-outbox.server"
import type {
  NotificationChannel,
  NotificationPresentation,
  ResolvedTimerNotificationSettings,
} from "@/lib/notification-preferences"
import { normalizeTimerNotificationSettings } from "@/lib/notification-preferences"
import type { NotificationScheduler } from "@/lib/notification-scheduler"
import { notificationDeliveryEventFromResult } from "@/lib/notification-tracking.server"
import type { NotificationDeliveryTracker } from "@/lib/notification-tracking.server"
import { getServerAdapters } from "@/lib/server-adapters.server"
import type { Timer } from "@/lib/types"

const BACKEND_DELIVERY_CHANNELS: NotificationChannel[] = ["push", "email", "sms", "chat"]

export type TimerNotificationDependencies = {
  notificationScheduler: NotificationScheduler
  notificationDeliveryProvider: {
    sendTimerFinished(command: {
      transactionId: string
      workflowIdentifier: "timer.finished"
      timerId: string
      label: string
      targetDate: string
      timezone: string
      channels: NotificationChannel[]
      presentation: NotificationPresentation
      recipient: NotificationRecipient
    }): Promise<DeliveryResult[]>
  }
  notificationDeliveryTracker: NotificationDeliveryTracker
  notificationOutboxRepository: NotificationOutboxRepository
}

export type ReconcileTimerNotificationInput = {
  timer: Timer
  dependencies?: Pick<TimerNotificationDependencies, "notificationScheduler">
}

export type SendTimerFinishedNotificationInput = {
  timer: Timer
  recipient: NotificationRecipient
  targetDate?: string
  transactionId?: string
  dependencies?: Pick<TimerNotificationDependencies, "notificationDeliveryProvider"> &
    Partial<Pick<TimerNotificationDependencies, "notificationDeliveryTracker" | "notificationOutboxRepository">>
}

export function enabledBackendNotificationChannels(settings: ResolvedTimerNotificationSettings): NotificationChannel[] {
  if (!settings.enabled) return []
  return BACKEND_DELIVERY_CHANNELS.filter((channel) => settings.channels[channel] === true)
}

export function timerNotificationSettings(timer: Timer): ResolvedTimerNotificationSettings {
  return normalizeTimerNotificationSettings(timer.notification, timer.notify)
}

export function timerNotificationTransactionId(timer: Timer, targetDate = timer.targetDate) {
  return `timer-finished:${timer.id}:${targetDate}`
}

function notificationDependencies(): TimerNotificationDependencies {
  const adapters = getServerAdapters()
  return {
    notificationScheduler: adapters.notificationScheduler,
    notificationDeliveryProvider: adapters.notificationDeliveryProvider,
    notificationDeliveryTracker: adapters.notificationDeliveryTracker,
    notificationOutboxRepository: adapters.notificationOutboxRepository,
  }
}

async function trackDeliveryResults(
  tracker: NotificationDeliveryTracker,
  command: Parameters<TimerNotificationDependencies["notificationDeliveryProvider"]["sendTimerFinished"]>[0],
  results: DeliveryResult[],
) {
  await Promise.all(
    results.map((result) => tracker.trackDelivery(notificationDeliveryEventFromResult(command, result))),
  )
}

function intentStatusFromDeliveryResults(results: DeliveryResult[]) {
  if (results.some((result) => result.status === "sent")) return "sent"
  if (results.some((result) => result.status === "failed")) return "failed"
  return "skipped"
}

export async function reconcileTimerNotificationSchedule(input: ReconcileTimerNotificationInput): Promise<void> {
  const dependencies = input.dependencies ?? notificationDependencies()
  const settings = timerNotificationSettings(input.timer)
  const channels = enabledBackendNotificationChannels(settings)

  if (input.timer.archivedAt || channels.length === 0) {
    await dependencies.notificationScheduler.cancelTimerNotification(input.timer.id)
    return
  }

  await dependencies.notificationScheduler.scheduleTimerNotification({
    timerId: input.timer.id,
    label: input.timer.label,
    targetDate: input.timer.targetDate,
    timezone: input.timer.timezone,
    channels,
    presentation: settings.presentation,
  })
}

export async function sendTimerFinishedNotification(
  input: SendTimerFinishedNotificationInput,
): Promise<DeliveryResult[]> {
  const dependencies = { ...notificationDependencies(), ...input.dependencies }
  const settings = timerNotificationSettings(input.timer)
  const channels = enabledBackendNotificationChannels(settings)
  if (input.timer.archivedAt || channels.length === 0) return []

  const targetDate = input.targetDate ?? input.timer.targetDate
  const command = {
    transactionId: input.transactionId ?? timerNotificationTransactionId(input.timer, targetDate),
    workflowIdentifier: NOTIFICATION_WORKFLOWS.timerFinished,
    timerId: input.timer.id,
    label: input.timer.label,
    targetDate,
    timezone: input.timer.timezone,
    channels,
    presentation: settings.presentation,
    recipient: input.recipient,
  }
  await dependencies.notificationOutboxRepository.upsertIntent({
    transactionId: command.transactionId,
    workflowIdentifier: command.workflowIdentifier,
    subscriberId: input.recipient.subscriberId,
    timerId: input.timer.id,
    channels,
    payload: {
      timerId: input.timer.id,
      label: input.timer.label,
      targetDate,
      timezone: input.timer.timezone,
      presentation: settings.presentation,
    },
    status: "processing",
  })

  const results = await dependencies.notificationDeliveryProvider.sendTimerFinished(command)
  await trackDeliveryResults(dependencies.notificationDeliveryTracker, command, results)
  await dependencies.notificationOutboxRepository.markIntentResult({
    transactionId: command.transactionId,
    status: intentStatusFromDeliveryResults(results),
    occurredAt: new Date().toISOString(),
    error: results.find((result) => result.status === "failed")?.reason,
  })

  return results
}

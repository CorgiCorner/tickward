import type {
  NotificationChannel,
  NotificationPresentation,
  TimerNotificationSettings,
} from "@/lib/notification-preferences"

export type NotificationRecipient = {
  subscriberId?: string
  email?: string
  phoneNumber?: string
  pushSubscriptionIds?: string[]
  chatConnectionIds?: string[]
}

export type TimerFinishedDeliveryCommand = {
  transactionId: string
  workflowIdentifier: "timer.finished"
  timerId: string
  label: string
  targetDate: string
  timezone: string
  channels: NotificationChannel[]
  presentation: NotificationPresentation
  recipient: NotificationRecipient
}

export type TimerDeliveryPlan = {
  settings: TimerNotificationSettings
  recipient: NotificationRecipient
}

export type DeliveryResult = {
  channel: NotificationChannel
  status: "sent" | "skipped" | "failed"
  reason?: string
  providerId?: string
  providerMessageId?: string
  senderType?: string
  senderId?: string
  attemptCount?: number
  successCount?: number
  failureCount?: number
}

export interface NotificationDeliveryProvider {
  sendTimerFinished(command: TimerFinishedDeliveryCommand): Promise<DeliveryResult[]>
}

export const nullNotificationDeliveryProvider: NotificationDeliveryProvider = {
  async sendTimerFinished(command: TimerFinishedDeliveryCommand): Promise<DeliveryResult[]> {
    return command.channels.map((channel) => ({
      channel,
      status: "skipped",
      reason: "provider_not_configured",
      providerId: "none",
    }))
  },
}

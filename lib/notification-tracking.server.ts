import "server-only"

import { createHash } from "node:crypto"

import type {
  DeliveryResult,
  NotificationRecipient,
  TimerFinishedDeliveryCommand,
  TimerReminderDeliveryCommand,
} from "@/lib/notification-delivery"

type NotificationDeliveryCommand = TimerFinishedDeliveryCommand | TimerReminderDeliveryCommand

export type NotificationDeliveryEvent = {
  transactionId: string
  workflowIdentifier: NotificationDeliveryCommand["workflowIdentifier"]
  subscriberId?: string
  timerId: string
  channel: DeliveryResult["channel"]
  providerId: string
  status: DeliveryResult["status"]
  reason?: string
  providerMessageId?: string
  recipientType: "email" | "phone" | "push_subscription" | "chat_connection" | "missing"
  recipientHash: string
  senderType?: string
  senderId?: string
  attemptCount: number
  successCount: number
  failureCount: number
  occurredAt: string
}

export interface NotificationDeliveryTracker {
  trackDelivery(event: NotificationDeliveryEvent): Promise<void>
}

export const nullNotificationDeliveryTracker: NotificationDeliveryTracker = {
  async trackDelivery() {},
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function notificationRecipientFingerprint(channel: DeliveryResult["channel"], recipient: NotificationRecipient) {
  if (channel === "email" && recipient.email) {
    return { recipientType: "email" as const, recipientHash: sha256(recipient.email.trim().toLowerCase()) }
  }
  if (channel === "sms" && recipient.phoneNumber) {
    return { recipientType: "phone" as const, recipientHash: sha256(recipient.phoneNumber.trim()) }
  }
  if (channel === "push" && recipient.pushSubscriptionIds?.length) {
    return {
      recipientType: "push_subscription" as const,
      recipientHash: sha256([...recipient.pushSubscriptionIds].sort((a, b) => a.localeCompare(b)).join(",")),
    }
  }
  if (channel === "chat" && recipient.chatConnectionIds?.length) {
    return {
      recipientType: "chat_connection" as const,
      recipientHash: sha256([...recipient.chatConnectionIds].sort((a, b) => a.localeCompare(b)).join(",")),
    }
  }

  return { recipientType: "missing" as const, recipientHash: sha256(`missing:${channel}`) }
}

export function notificationDeliveryEventFromResult(
  command: NotificationDeliveryCommand,
  result: DeliveryResult,
  occurredAt = new Date().toISOString(),
): NotificationDeliveryEvent {
  const attemptCount = result.attemptCount ?? (result.status === "skipped" ? 0 : 1)
  const successCount = result.successCount ?? (result.status === "sent" ? 1 : 0)
  const failureCount = result.failureCount ?? (result.status === "failed" ? 1 : 0)

  return {
    transactionId: command.transactionId,
    workflowIdentifier: command.workflowIdentifier,
    subscriberId: command.recipient.subscriberId,
    timerId: command.timerId,
    channel: result.channel,
    providerId: result.providerId ?? "none",
    status: result.status,
    reason: result.reason,
    providerMessageId: result.providerMessageId,
    ...notificationRecipientFingerprint(result.channel, command.recipient),
    senderType: result.senderType,
    senderId: result.senderId,
    attemptCount,
    successCount,
    failureCount,
    occurredAt,
  }
}

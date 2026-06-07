import "server-only"

import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { NotificationDeliveryTracker } from "@/lib/notification-tracking.server"

export const prismaNotificationDeliveryTracker: NotificationDeliveryTracker = {
  async trackDelivery(event) {
    const prisma = requirePrismaClient()

    await prisma.notificationDeliveryLog.upsert({
      where: {
        transactionId_channel_providerId_recipientHash: {
          transactionId: event.transactionId,
          channel: event.channel,
          providerId: event.providerId,
          recipientHash: event.recipientHash,
        },
      },
      update: {
        workflowIdentifier: event.workflowIdentifier,
        subscriberId: event.subscriberId,
        status: event.status,
        reason: event.reason,
        providerMessageId: event.providerMessageId,
        senderType: event.senderType,
        senderId: event.senderId,
        attemptCount: event.attemptCount,
        successCount: event.successCount,
        failureCount: event.failureCount,
        sentAt: event.status === "sent" ? new Date(event.occurredAt) : undefined,
        failedAt: event.status === "failed" ? new Date(event.occurredAt) : undefined,
      },
      create: {
        transactionId: event.transactionId,
        workflowIdentifier: event.workflowIdentifier,
        subscriberId: event.subscriberId,
        timerId: event.timerId,
        channel: event.channel,
        providerId: event.providerId,
        status: event.status,
        reason: event.reason,
        providerMessageId: event.providerMessageId,
        recipientType: event.recipientType,
        recipientHash: event.recipientHash,
        senderType: event.senderType,
        senderId: event.senderId,
        attemptCount: event.attemptCount,
        successCount: event.successCount,
        failureCount: event.failureCount,
        sentAt: event.status === "sent" ? new Date(event.occurredAt) : undefined,
        failedAt: event.status === "failed" ? new Date(event.occurredAt) : undefined,
      },
    })
  },
}

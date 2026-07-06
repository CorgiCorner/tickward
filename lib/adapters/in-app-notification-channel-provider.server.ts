import "server-only"

import { requirePrismaClient } from "@/lib/db/prisma.server"
import type {
  DeliveryResult,
  TimerFinishedDeliveryCommand,
  TimerReminderDeliveryCommand,
} from "@/lib/notification-delivery"
import type { NotificationChannel } from "@/lib/notification-preferences"

export type NotificationChannelProvider = {
  channel: NotificationChannel
  providerId: string
  sendTimerFinished(command: TimerFinishedDeliveryCommand): Promise<DeliveryResult>
  sendTimerReminder?(command: TimerReminderDeliveryCommand): Promise<DeliveryResult>
}

type InAppNotificationDelegate = {
  deleteMany(args: { where: Record<string, unknown> }): Promise<unknown>
  findMany(args: {
    orderBy: Array<Partial<Record<"createdAt" | "id", "asc" | "desc">>>
    select: { id: true }
    skip: number
    where: { userId: string }
  }): Promise<Array<{ id: string }>>
  upsert(args: {
    where: { userId_transactionId: { transactionId: string; userId: string } }
    update: Record<string, unknown>
    create: Record<string, unknown>
  }): Promise<{ id: string }>
}

type UserPreferenceDelegate = {
  findUnique(args: {
    select: { inAppNotifications: true }
    where: { userId: string }
  }): Promise<{ inAppNotifications?: boolean | null } | null>
}

type InAppPrisma = {
  inAppNotification?: InAppNotificationDelegate
  userPreference?: UserPreferenceDelegate
}

function skipped(reason: string): DeliveryResult {
  return {
    channel: "in_app",
    status: "skipped",
    reason,
    providerId: "inbox",
    attemptCount: 0,
    successCount: 0,
    failureCount: 0,
  }
}

function inAppDelegate(prisma: unknown): InAppNotificationDelegate | null {
  return (prisma as InAppPrisma).inAppNotification ?? null
}

async function inAppNotificationsEnabled(resolved: boolean | undefined, userId: string, prisma: unknown) {
  // Callers that already loaded the account preference pass it on the command
  // so the provider can skip the lookup; the query is only a fallback.
  if (typeof resolved === "boolean") return resolved
  const delegate = (prisma as InAppPrisma).userPreference
  if (!delegate) return true
  const row = await delegate.findUnique({
    where: { userId },
    select: { inAppNotifications: true },
  })
  return row?.inAppNotifications !== false
}

async function trimInbox(userId: string, delegate: InAppNotificationDelegate) {
  const rows = await delegate.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
    skip: 100,
  })
  const ids = rows.map((row) => row.id)
  if (ids.length === 0) return
  await delegate.deleteMany({ where: { id: { in: ids }, userId } })
}

export function createInAppNotificationChannelProvider(): NotificationChannelProvider {
  return {
    channel: "in_app",
    providerId: "inbox",
    async sendTimerFinished() {
      return skipped("provider_not_configured")
    },
    async sendTimerReminder(command) {
      const userId = command.recipient.subscriberId
      if (!userId) return skipped("missing_recipient")

      const prisma = requirePrismaClient()
      if (!(await inAppNotificationsEnabled(command.inAppNotificationsEnabled, userId, prisma))) {
        return skipped("preference_disabled")
      }

      const delegate = inAppDelegate(prisma)
      if (!delegate) return skipped("provider_not_configured")

      const payload = {
        label: command.label,
        offsetMinutes: command.offsetMinutes,
        occurrenceAt: command.occurrenceAt,
        timezone: command.timezone,
      }
      const row = await delegate.upsert({
        where: {
          userId_transactionId: {
            userId,
            transactionId: command.transactionId,
          },
        },
        update: {
          payload,
          projectId: command.projectId,
          timerId: command.timerId,
          type: command.workflowIdentifier,
        },
        create: {
          userId,
          transactionId: command.transactionId,
          type: command.workflowIdentifier,
          timerId: command.timerId,
          projectId: command.projectId,
          payload,
        },
      })
      await trimInbox(userId, delegate)

      return {
        channel: "in_app",
        status: "sent",
        providerId: "inbox",
        providerMessageId: row.id,
        attemptCount: 1,
        successCount: 1,
        failureCount: 0,
      }
    },
  }
}

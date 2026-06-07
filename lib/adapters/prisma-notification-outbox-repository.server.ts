import "server-only"

import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"
import type {
  NotificationIntentInput,
  NotificationJsonValue,
  NotificationIntentRecord,
  NotificationIntentResult,
  NotificationOutboxRepository,
} from "@/lib/notification-outbox.server"

function jsonInput(value: NotificationJsonValue | NotificationJsonValue[]): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function optionalJsonInput(value: NotificationJsonValue | NotificationJsonValue[] | undefined) {
  return value === undefined ? undefined : jsonInput(value)
}

function toRecord(record: {
  id: string
  transactionId: string
  workflowIdentifier: string
  subscriberId: string | null
  timerId: string | null
  channels: unknown
  payload: unknown
  overrides: unknown
  status: string
  scheduledFor: Date | null
  createdAt: Date
  updatedAt: Date
  processedAt: Date | null
  cancelledAt: Date | null
  failedAt: Date | null
  error: string | null
}): NotificationIntentRecord {
  return {
    id: record.id,
    transactionId: record.transactionId,
    workflowIdentifier: record.workflowIdentifier as NotificationIntentRecord["workflowIdentifier"],
    subscriberId: record.subscriberId ?? undefined,
    timerId: record.timerId ?? undefined,
    channels: Array.isArray(record.channels) ? (record.channels as NotificationIntentRecord["channels"]) : [],
    payload:
      record.payload && typeof record.payload === "object"
        ? (record.payload as Record<string, NotificationJsonValue>)
        : {},
    overrides:
      record.overrides && typeof record.overrides === "object"
        ? (record.overrides as Record<string, NotificationJsonValue>)
        : undefined,
    status: record.status as NotificationIntentRecord["status"],
    scheduledFor: record.scheduledFor?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    processedAt: record.processedAt?.toISOString(),
    cancelledAt: record.cancelledAt?.toISOString(),
    failedAt: record.failedAt?.toISOString(),
    error: record.error ?? undefined,
  }
}

export const prismaNotificationOutboxRepository: NotificationOutboxRepository = {
  async upsertIntent(input: NotificationIntentInput) {
    const prisma = requirePrismaClient()

    const record = await prisma.notificationOutboxItem.upsert({
      where: { transactionId: input.transactionId },
      update: {
        workflowIdentifier: input.workflowIdentifier,
        subscriberId: input.subscriberId,
        timerId: input.timerId,
        channels: jsonInput(input.channels),
        payload: jsonInput(input.payload),
        overrides: optionalJsonInput(input.overrides),
        status: input.status,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
      },
      create: {
        transactionId: input.transactionId,
        workflowIdentifier: input.workflowIdentifier,
        subscriberId: input.subscriberId,
        timerId: input.timerId,
        channels: jsonInput(input.channels),
        payload: jsonInput(input.payload),
        overrides: optionalJsonInput(input.overrides),
        status: input.status,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
      },
    })

    return toRecord(record)
  },

  async markIntentResult(result: NotificationIntentResult) {
    const prisma = requirePrismaClient()

    await prisma.notificationOutboxItem.updateMany({
      where: { transactionId: result.transactionId },
      data: {
        status: result.status,
        error: result.error,
        processedAt: result.status === "sent" || result.status === "skipped" ? new Date(result.occurredAt) : undefined,
        failedAt: result.status === "failed" ? new Date(result.occurredAt) : undefined,
        cancelledAt: result.status === "cancelled" ? new Date(result.occurredAt) : undefined,
      },
    })
  },
}

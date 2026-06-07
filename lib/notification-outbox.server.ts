import "server-only"

import type { NotificationChannel } from "@/lib/notification-preferences"

export const NOTIFICATION_WORKFLOWS = {
  timerFinished: "timer.finished",
} as const

export type NotificationWorkflowIdentifier = (typeof NOTIFICATION_WORKFLOWS)[keyof typeof NOTIFICATION_WORKFLOWS]
export type NotificationJsonValue =
  | boolean
  | null
  | number
  | string
  | NotificationJsonValue[]
  | { [key: string]: NotificationJsonValue }

export type NotificationIntentStatus =
  | "pending"
  | "scheduled"
  | "processing"
  | "sent"
  | "skipped"
  | "failed"
  | "cancelled"

export type NotificationIntentInput = {
  transactionId: string
  workflowIdentifier: NotificationWorkflowIdentifier
  subscriberId?: string
  timerId?: string
  channels: NotificationChannel[]
  payload: Record<string, NotificationJsonValue>
  overrides?: Record<string, NotificationJsonValue>
  status: NotificationIntentStatus
  scheduledFor?: string
}

export type NotificationIntentRecord = NotificationIntentInput & {
  id: string
  createdAt: string
  updatedAt: string
  processedAt?: string
  cancelledAt?: string
  failedAt?: string
  error?: string
}

export type NotificationIntentResult = {
  transactionId: string
  status: Extract<NotificationIntentStatus, "sent" | "skipped" | "failed" | "cancelled">
  occurredAt: string
  error?: string
}

export interface NotificationOutboxRepository {
  upsertIntent(input: NotificationIntentInput): Promise<NotificationIntentRecord>
  markIntentResult(result: NotificationIntentResult): Promise<void>
}

export const nullNotificationOutboxRepository: NotificationOutboxRepository = {
  async upsertIntent(input) {
    const now = new Date().toISOString()
    return {
      ...input,
      id: input.transactionId,
      createdAt: now,
      updatedAt: now,
    }
  },
  async markIntentResult() {},
}

import "server-only"

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { DeliveryResult, TimerReminderDeliveryCommand } from "@/lib/notification-delivery"
import { NOTIFICATION_WORKFLOWS } from "@/lib/notification-outbox.server"
import type { NotificationChannel } from "@/lib/notification-preferences"
import {
  notificationDeliveryEventFromResult,
  notificationRecipientFingerprint,
} from "@/lib/notification-tracking.server"
import { optionalServerEnv } from "@/lib/env.server"
import { getServerAdapters } from "@/lib/server-adapters.server"
import { timerSchema } from "@/lib/schemas/timer"
import type { Timer } from "@/lib/types"
import { effectiveTargetDate, nextSlotOccurrence, recurrenceSlot } from "@/lib/utils"

const REMINDER_GRACE_MS = 60_000
const LATE_WINDOW_MS = 30 * 60_000
const IN_APP_RETENTION_MS = 90 * 24 * 60 * 60_000
const OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60_000
const DEFAULT_EMAIL_DAILY_CAP = 100
const DEFAULT_EMAIL_DAILY_CAP_PER_USER = 10
const TIMER_REMINDER_CHANNELS: NotificationChannel[] = ["in_app", "email"]
const TIMER_REMINDER_TERMINAL_STATUSES = ["sent", "skipped", "failed", "cancelled"]

type ReminderTx = Prisma.TransactionClient

type ReminderOutboxRow = {
  id: string
  transactionId: string
  timerId: string | null
  payload: unknown
}

type ReminderIntent = {
  transactionId: string
  scheduledFor: Date
  payload: ReturnType<typeof reminderPayload>
}

export type TimerReminderTickResult = {
  delivered: number
  failed: number
  picked: number
  skipped: number
}

function reminderPrisma(): PrismaClient {
  return requirePrismaClient()
}

function positiveLimit(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : 25
}

function nonNegativeIntEnv(
  name: "TICKWARD_REMINDER_EMAIL_DAILY_CAP" | "TICKWARD_REMINDER_EMAIL_DAILY_CAP_PER_USER",
  fallback: number,
) {
  const raw = optionalServerEnv(name)?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback
}

export function reminderEmailDailyCap() {
  return nonNegativeIntEnv("TICKWARD_REMINDER_EMAIL_DAILY_CAP", DEFAULT_EMAIL_DAILY_CAP)
}

export function reminderEmailDailyCapPerUser() {
  return nonNegativeIntEnv("TICKWARD_REMINDER_EMAIL_DAILY_CAP_PER_USER", DEFAULT_EMAIL_DAILY_CAP_PER_USER)
}

export function timerReminderTransactionId(
  projectId: string,
  timerId: string,
  offsetMinutes: number,
  occurrenceIso: string,
) {
  // Timer ids are only unique per project, so the project id keeps
  // transaction ids (globally unique in the outbox) from colliding across
  // projects that picked the same timer id.
  return `timer-reminder:${projectId}:${timerId}:${offsetMinutes}m:${occurrenceIso}`
}

// Scopes reminder-outbox filters to one project's timer. The outbox has no
// projectId column, but every reminder payload records it.
function reminderProjectFilter(projectId: string) {
  return { payload: { path: ["projectId"], equals: projectId } } as const
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function reminderPayload(args: {
  projectId: string
  timer: Timer
  offsetMinutes: number
  occurrenceAt: string
  scheduledFor: Date
}) {
  return {
    projectId: args.projectId,
    timerId: args.timer.id,
    label: args.timer.label,
    offsetMinutes: args.offsetMinutes,
    occurrenceAt: args.occurrenceAt,
    scheduledFor: args.scheduledFor.toISOString(),
    timezone: args.timer.timezone,
  }
}

function desiredReminderIntent(args: {
  projectId: string
  timer: Timer
  offsetMinutes: number
  occurrenceIso: string
}): ReminderIntent | null {
  const occurrenceMs = new Date(args.occurrenceIso).getTime()
  if (Number.isNaN(occurrenceMs)) return null

  const scheduledFor = new Date(occurrenceMs - args.offsetMinutes * 60_000)
  if (scheduledFor.getTime() < Date.now() - REMINDER_GRACE_MS) return null

  return {
    transactionId: timerReminderTransactionId(args.projectId, args.timer.id, args.offsetMinutes, args.occurrenceIso),
    scheduledFor,
    payload: reminderPayload({
      projectId: args.projectId,
      timer: args.timer,
      offsetMinutes: args.offsetMinutes,
      occurrenceAt: args.occurrenceIso,
      scheduledFor,
    }),
  }
}

async function writeScheduledReminderIntent(
  tx: ReminderTx,
  args: {
    intent: ReminderIntent
    ownerId: string
    timerId: string
  },
) {
  const updated = await tx.notificationOutboxItem.updateMany({
    where: {
      transactionId: args.intent.transactionId,
      status: { in: ["scheduled", "cancelled"] },
    },
    data: {
      workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
      subscriberId: args.ownerId,
      timerId: args.timerId,
      channels: TIMER_REMINDER_CHANNELS,
      payload: args.intent.payload,
      scheduledFor: args.intent.scheduledFor,
      status: "scheduled",
      cancelledAt: null,
      error: null,
      failedAt: null,
      processedAt: null,
    },
  })
  if (updated.count > 0) return

  await tx.notificationOutboxItem.createMany({
    skipDuplicates: true,
    data: [
      {
        transactionId: args.intent.transactionId,
        workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
        subscriberId: args.ownerId,
        timerId: args.timerId,
        channels: TIMER_REMINDER_CHANNELS,
        payload: args.intent.payload,
        scheduledFor: args.intent.scheduledFor,
        status: "scheduled",
      },
    ],
  })
}

export async function cancelScheduledTimerReminderIntentsForTimer(
  tx: Prisma.TransactionClient,
  args: { projectId: string; timerId: string },
) {
  await tx.notificationOutboxItem.updateMany({
    where: {
      timerId: args.timerId,
      workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
      status: "scheduled",
      ...reminderProjectFilter(args.projectId),
    },
    data: { cancelledAt: new Date(), status: "cancelled" },
  })
}

export async function cancelScheduledTimerReminderIntentsForTimers(
  tx: Prisma.TransactionClient,
  args: { projectId: string; timerIds: string[] },
) {
  if (args.timerIds.length === 0) return
  await tx.notificationOutboxItem.updateMany({
    where: {
      timerId: { in: args.timerIds },
      workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
      status: "scheduled",
      ...reminderProjectFilter(args.projectId),
    },
    data: { cancelledAt: new Date(), status: "cancelled" },
  })
}

export async function reconcileTimerReminders(
  tx: Prisma.TransactionClient,
  args: { project: { id: string; ownerId: string | null | undefined }; timer: Timer },
) {
  const reminders = args.timer.reminders ?? []
  if (!args.project.ownerId || args.timer.archivedAt || reminders.length === 0) {
    await cancelScheduledTimerReminderIntentsForTimer(tx, { projectId: args.project.id, timerId: args.timer.id })
    return
  }

  const occurrenceIso = effectiveTargetDate(args.timer, Date.now())
  const desired = reminders.flatMap((reminder) => {
    const intent = desiredReminderIntent({
      projectId: args.project.id,
      timer: args.timer,
      offsetMinutes: reminder.offsetMinutes,
      occurrenceIso,
    })
    return intent ? [intent] : []
  })
  const desiredIds = desired.map((intent) => intent.transactionId)

  await tx.notificationOutboxItem.updateMany({
    where: {
      timerId: args.timer.id,
      workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
      status: "scheduled",
      transactionId: { notIn: desiredIds },
      ...reminderProjectFilter(args.project.id),
    },
    data: { cancelledAt: new Date(), status: "cancelled" },
  })

  for (const intent of desired) {
    await writeScheduledReminderIntent(tx, {
      intent,
      ownerId: args.project.ownerId,
      timerId: args.timer.id,
    })
  }
}

async function pickDueTimerReminderIntents(limit: number) {
  const prisma = reminderPrisma()
  const safeLimit = positiveLimit(limit)
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "notification_outbox_item"
      WHERE "workflowIdentifier" = ${NOTIFICATION_WORKFLOWS.timerReminder}
        AND "status" = 'scheduled'
        AND "scheduledFor" <= now()
        AND "scheduledFor" > now() - ${LATE_WINDOW_MS} * interval '1 millisecond'
      ORDER BY "scheduledFor" ASC, "createdAt" ASC
      LIMIT ${safeLimit}
      FOR UPDATE SKIP LOCKED
    `
    const ids = rows.map((row) => row.id)
    if (ids.length === 0) return []

    await tx.notificationOutboxItem.updateMany({
      where: { id: { in: ids }, status: "scheduled" },
      data: { status: "processing" },
    })

    return tx.notificationOutboxItem.findMany({
      where: { id: { in: ids } },
      orderBy: { scheduledFor: "asc" },
    })
  })
}

async function skipLateTimerReminderIntents() {
  const cutoff = new Date(Date.now() - LATE_WINDOW_MS)
  const result = await reminderPrisma().notificationOutboxItem.updateMany({
    where: {
      workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
      status: "scheduled",
      scheduledFor: { lt: cutoff },
    },
    data: {
      status: "skipped",
      processedAt: new Date(),
      error: "late_window",
    },
  })
  return result.count
}

function parsedReminderIntentPayload(item: ReminderOutboxRow) {
  const payload = asRecord(item.payload)
  const parsedOffset =
    typeof payload.offsetMinutes === "number"
      ? payload.offsetMinutes
      : Number(item.transactionId.match(/^timer-reminder:[^:]+:(\d+)m:/)?.[1])
  const occurrenceAt =
    typeof payload.occurrenceAt === "string"
      ? payload.occurrenceAt
      : item.transactionId.match(/^timer-reminder:[^:]+:\d+m:(.+)$/)?.[1]

  if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0 || !occurrenceAt) return null
  const occurrenceMs = new Date(occurrenceAt).getTime()
  if (Number.isNaN(occurrenceMs)) return null
  return { offsetMinutes: parsedOffset, occurrenceAt }
}

function utcDayStart(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function emailCapSkippedResult(): DeliveryResult {
  return {
    channel: "email",
    status: "skipped",
    reason: "email_daily_cap",
    providerId: "none",
    attemptCount: 0,
    successCount: 0,
    failureCount: 0,
  }
}

async function emailAllowedByCaps(prisma: PrismaClient, email: string) {
  const dayStart = utcDayStart()
  // Only rows that consumed provider quota count toward the caps; failed
  // attempts and synthetic cap-skip results must not eat the daily budget.
  const baseWhere = {
    channel: "email",
    workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
    status: "sent",
    createdAt: { gte: dayStart },
  }
  const globalCap = reminderEmailDailyCap()
  if (globalCap <= 0) return false
  const globalCount = await prisma.notificationDeliveryLog.count({ where: baseWhere })
  if (globalCount >= globalCap) return false

  const perUserCap = reminderEmailDailyCapPerUser()
  if (perUserCap <= 0) return false
  const { recipientHash } = notificationRecipientFingerprint("email", { email })
  const perUserCount = await prisma.notificationDeliveryLog.count({
    where: { ...baseWhere, recipientHash },
  })
  return perUserCount < perUserCap
}

function intentStatusFromDeliveryResults(results: DeliveryResult[]): "sent" | "skipped" | "failed" {
  if (results.some((result) => result.status === "sent")) return "sent"
  if (results.some((result) => result.status === "failed")) return "failed"
  return "skipped"
}

async function markReminderIntentResult(
  item: ReminderOutboxRow,
  result: { error?: string; status: "sent" | "skipped" | "failed" },
) {
  const now = new Date()
  await reminderPrisma().notificationOutboxItem.updateMany({
    where: { id: item.id },
    data: {
      status: result.status,
      error: result.error,
      processedAt: result.status === "sent" || result.status === "skipped" ? now : undefined,
      failedAt: result.status === "failed" ? now : undefined,
    },
  })
}

async function loadTimerForReminder(item: ReminderOutboxRow) {
  if (!item.timerId) return null
  // Timer ids are unique per project. The reminder payload carries the
  // project id; rows created before it was recorded predate per-project ids,
  // so for them the timer id alone is still unambiguous.
  const payload = item.payload as { projectId?: unknown } | null
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : undefined
  if (projectId) {
    return reminderPrisma().timer.findFirst({
      where: { id: item.timerId, projectId },
      include: {
        project: {
          include: {
            owner: {
              include: { preference: true },
            },
          },
        },
      },
    })
  }
  // Rows without a recorded project id: only deliver when the timer id still
  // maps to exactly one row, otherwise a colliding id from another project
  // could notify the wrong user.
  const rows = await reminderPrisma().timer.findMany({
    where: { id: item.timerId },
    include: {
      project: {
        include: {
          owner: {
            include: { preference: true },
          },
        },
      },
    },
    take: 2,
  })
  return rows.length === 1 ? rows[0] : null
}

async function trackReminderResults(command: TimerReminderDeliveryCommand, results: DeliveryResult[]) {
  const { notificationDeliveryTracker } = getServerAdapters()
  await Promise.all(
    results.map((result) =>
      notificationDeliveryTracker.trackDelivery(notificationDeliveryEventFromResult(command, result)),
    ),
  )
}

async function scheduleNextRecurringReminder(args: {
  occurrenceAt: string
  offsetMinutes: number
  ownerId: string
  projectId: string
  timer: Timer
}) {
  if (!args.timer.recurrence?.enabled) return
  const occurrenceMs = new Date(args.occurrenceAt).getTime()
  if (Number.isNaN(occurrenceMs)) return

  const slot = recurrenceSlot(
    args.timer.targetDate,
    args.timer.recurrence.type,
    args.timer.timezone,
    args.timer.recurrence.lastDay,
  )
  const nextOccurrence = nextSlotOccurrence(slot, args.timer.timezone, occurrenceMs)
  if (!nextOccurrence) return
  const intent = desiredReminderIntent({
    projectId: args.projectId,
    timer: args.timer,
    offsetMinutes: args.offsetMinutes,
    occurrenceIso: nextOccurrence,
  })
  if (!intent) return

  await reminderPrisma().$transaction(async (tx) => {
    await writeScheduledReminderIntent(tx, {
      intent,
      ownerId: args.ownerId,
      timerId: args.timer.id,
    })
  })
}

async function deliverTimerReminderIntent(item: ReminderOutboxRow): Promise<"sent" | "skipped" | "failed"> {
  const payload = parsedReminderIntentPayload(item)
  if (!payload) {
    await markReminderIntentResult(item, { status: "skipped", error: "invalid_payload" })
    return "skipped"
  }

  try {
    const row = await loadTimerForReminder(item)
    const owner = row?.project?.owner
    const parsedTimer = timerSchema.safeParse(row?.data)
    if (!row?.project || !owner || !parsedTimer.success) {
      await markReminderIntentResult(item, { status: "skipped", error: "missing_timer" })
      return "skipped"
    }

    const timer = parsedTimer.data
    const offsetStillExists = (timer.reminders ?? []).some(
      (reminder) => reminder.offsetMinutes === payload.offsetMinutes,
    )
    if (timer.archivedAt || !offsetStillExists) {
      await markReminderIntentResult(item, { status: "skipped", error: "stale_reminder" })
      return "skipped"
    }

    const capResult =
      owner.preference?.emailReminders === true && owner.email
        ? (await emailAllowedByCaps(reminderPrisma(), owner.email))
          ? null
          : emailCapSkippedResult()
        : null
    const inAppNotificationsEnabled = owner.preference?.inAppNotifications !== false
    const channels: NotificationChannel[] = inAppNotificationsEnabled ? ["in_app"] : []
    if (owner.preference?.emailReminders === true && owner.email && !capResult) channels.push("email")

    const command: TimerReminderDeliveryCommand = {
      transactionId: item.transactionId,
      workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
      timerId: timer.id,
      projectId: row.project.id,
      label: timer.label,
      timezone: timer.timezone,
      channels,
      recipient: {
        subscriberId: owner.id,
        email: owner.email,
      },
      offsetMinutes: payload.offsetMinutes,
      occurrenceAt: payload.occurrenceAt,
      inAppNotificationsEnabled,
    }

    const providerResults =
      channels.length > 0 ? await getServerAdapters().notificationDeliveryProvider.sendTimerReminder(command) : []
    const results = capResult ? [...providerResults, capResult] : providerResults
    await trackReminderResults(command, results)
    const status = intentStatusFromDeliveryResults(results)

    // Chain the next occurrence before marking this intent terminal, and
    // regardless of the provider outcome: the timer still recurs, so a
    // transient provider failure or skip must not end the chain. The write is
    // idempotent per transactionId, so a crash between the two steps leaves a
    // retryable intent instead of a silently dead recurrence.
    await scheduleNextRecurringReminder({
      occurrenceAt: payload.occurrenceAt,
      offsetMinutes: payload.offsetMinutes,
      ownerId: owner.id,
      projectId: row.project.id,
      timer,
    })

    await markReminderIntentResult(item, {
      status,
      error: results.find((result) => result.status === "failed")?.reason,
    })

    return status
  } catch (error) {
    await markReminderIntentResult(item, {
      status: "failed",
      error: error instanceof Error ? error.message : "timer_reminder_delivery_failed",
    })
    return "failed"
  }
}

async function sweepTimerReminderRetention() {
  const prisma = reminderPrisma()
  const now = Date.now()
  await prisma.inAppNotification.deleteMany({
    where: { createdAt: { lt: new Date(now - IN_APP_RETENTION_MS) } },
  })
  await prisma.notificationOutboxItem.deleteMany({
    where: {
      workflowIdentifier: NOTIFICATION_WORKFLOWS.timerReminder,
      status: { in: TIMER_REMINDER_TERMINAL_STATUSES },
      updatedAt: { lt: new Date(now - OUTBOX_RETENTION_MS) },
    },
  })
}

export async function deliverDueTimerReminders(limit = 25): Promise<TimerReminderTickResult> {
  const skippedLate = await skipLateTimerReminderIntents()
  const items = await pickDueTimerReminderIntents(limit)
  let delivered = 0
  let failed = 0
  let skipped = skippedLate

  for (const item of items) {
    const result = await deliverTimerReminderIntent(item)
    if (result === "sent") delivered += 1
    if (result === "failed") failed += 1
    if (result === "skipped") skipped += 1
  }

  await sweepTimerReminderRetention()
  return { delivered, failed, picked: items.length, skipped }
}

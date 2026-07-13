import { apiError, apiJson, isResponse } from "@/lib/api-response"
import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  requireSignedInUser,
} from "@/lib/account-api-route.server"
import { API_KEY_KIND } from "@/lib/api-keys.server"
import { ACCOUNT_EXPORT_FORMAT, ACCOUNT_EXPORT_VERSION } from "@/lib/account-migration"
import { DEFAULT_ACCOUNT_PREFERENCES } from "@/lib/account-preferences"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import { notificationSoundSchema } from "@/lib/schemas/timer"

export const runtime = "nodejs"

const MASKED_WEBHOOK_SECRET = "********"

function accountExportStorageUnavailable(operation: string, error: unknown) {
  return accountRouteStorageUnavailable({
    error,
    logName: "accountExport",
    message: "Account export storage is unavailable.",
    operation,
  })
}

function dateString(value: Date | null | undefined) {
  return value?.toISOString() ?? null
}

function endpointOrigin(endpoint: string) {
  try {
    return new URL(endpoint).origin
  } catch {
    return null
  }
}

function exportFilename(exportedAt: Date) {
  return `tickward-export-${exportedAt.toISOString().slice(0, 10)}.json`
}

function exportedNotificationSound(value: string) {
  const parsed = notificationSoundSchema.safeParse(value)
  return parsed.success ? parsed.data : "none"
}

async function loadAccountExport(userId: string) {
  const prisma = requirePrismaClient()
  const [
    user,
    projects,
    accountPreferences,
    notificationPreferences,
    webhookEndpoints,
    apiKeys,
    pushSubscriptions,
    inboxNotifications,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    }),
    prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        color: true,
        snapshot: true,
        createdAt: true,
        updatedAt: true,
        claimedAt: true,
      },
    }),
    prisma.userPreference.findUnique({
      where: { userId },
      select: {
        defaultTimezone: true,
        emailReminders: true,
        fullPageAlarm: true,
        inAppNotifications: true,
        notificationSound: true,
      },
    }),
    prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ targetType: "asc" }, { targetId: "asc" }],
      select: {
        id: true,
        targetType: true,
        targetId: true,
        channels: true,
        presentation: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.webhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        eventTypes: true,
        status: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
        disabledAt: true,
        lastDeliveredAt: true,
        lastFailedAt: true,
      },
    }),
    prisma.apiKey.findMany({
      where: { kind: API_KEY_KIND, userId },
      orderBy: { createdAt: "desc" },
      select: {
        name: true,
        permission: true,
        createdAt: true,
        lastUsedAt: true,
      },
    }),
    prisma.webPushSubscription.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        endpoint: true,
        expirationTime: true,
        userAgent: true,
        createdAt: true,
        updatedAt: true,
        revokedAt: true,
        lastSeenAt: true,
      },
    }),
    prisma.inAppNotification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        transactionId: true,
        type: true,
        timerId: true,
        projectId: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ])

  if (!user) {
    return null
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    },
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      color: project.color,
      snapshot: project.snapshot,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      claimedAt: dateString(project.claimedAt),
    })),
    accountPreferences: accountPreferences
      ? {
          object: "account_preferences" as const,
          default_timezone: accountPreferences.defaultTimezone,
          email_reminders: accountPreferences.emailReminders,
          full_page_alarm: accountPreferences.fullPageAlarm,
          in_app_notifications: accountPreferences.inAppNotifications,
          notification_sound: exportedNotificationSound(accountPreferences.notificationSound),
        }
      : DEFAULT_ACCOUNT_PREFERENCES,
    notificationPreferences: notificationPreferences.map((preference) => ({
      id: preference.id,
      targetType: preference.targetType,
      targetId: preference.targetId,
      channels: preference.channels,
      presentation: preference.presentation,
      createdAt: preference.createdAt.toISOString(),
      updatedAt: preference.updatedAt.toISOString(),
    })),
    webhookEndpoints: webhookEndpoints.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      secret: MASKED_WEBHOOK_SECRET,
      eventTypes: endpoint.eventTypes,
      status: endpoint.status,
      failureCount: endpoint.failureCount,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString(),
      disabledAt: dateString(endpoint.disabledAt),
      lastDeliveredAt: dateString(endpoint.lastDeliveredAt),
      lastFailedAt: dateString(endpoint.lastFailedAt),
    })),
    apiKeys: apiKeys.map((apiKey) => ({
      name: apiKey.name,
      permission: apiKey.permission,
      createdAt: apiKey.createdAt.toISOString(),
      lastUsedAt: dateString(apiKey.lastUsedAt),
    })),
    pushSubscriptions: pushSubscriptions.map((subscription) => ({
      id: subscription.id,
      endpointOrigin: endpointOrigin(subscription.endpoint),
      expirationTime: subscription.expirationTime === null ? null : Number(subscription.expirationTime),
      userAgent: subscription.userAgent,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
      revokedAt: dateString(subscription.revokedAt),
      lastSeenAt: dateString(subscription.lastSeenAt),
    })),
    inboxNotifications: inboxNotifications.map((notification) => ({
      id: notification.id,
      transactionId: notification.transactionId,
      type: notification.type,
      timerId: notification.timerId,
      projectId: notification.projectId,
      payload: notification.payload,
      readAt: dateString(notification.readAt),
      createdAt: notification.createdAt.toISOString(),
    })),
  }
}

export async function GET(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to export account data.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({
    bucket: "account-export",
    key: `user:${actor.user.id}`,
  })
  if (rateLimit) return rateLimit

  const exportedAt = new Date()

  try {
    const accountExport = await loadAccountExport(actor.user.id)
    if (!accountExport) {
      return apiError("unauthorized", "Sign in to export account data.", { status: 401 })
    }
    return apiJson(
      {
        format: ACCOUNT_EXPORT_FORMAT,
        version: ACCOUNT_EXPORT_VERSION,
        exportedAt: exportedAt.toISOString(),
        ...accountExport,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${exportFilename(exportedAt)}"`,
          "Content-Type": "application/json",
        },
      },
    )
  } catch (error) {
    return accountExportStorageUnavailable("export", error)
  }
}

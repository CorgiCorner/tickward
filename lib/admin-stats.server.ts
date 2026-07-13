import "server-only"

import { requirePrismaClient } from "@/lib/db/prisma.server"

const DAY_MS = 24 * 60 * 60 * 1000
const DAILY_WINDOW_DAYS = 30

export type DailyPoint = { day: string; count: number }
export type AdminStats = {
  generatedAt: string
  users: {
    total: number
    new7d: number
    new30d: number
    banned: number
    activeSessions: number
    dailySignups: DailyPoint[]
  }
  usage: {
    timersActive: number
    timersArchived: number
    dailyTimersCreated: DailyPoint[]
    projectsOwned: number
    projectsOwnerless: number
    sharesTotal: number
    pushSubscriptionsActive: number
  }
  integrations: {
    apiKeysActive: number
    apiKeysRevoked: number
    apiKeysUsed7d: number
    apiKeysByKind: Array<{ kind: string; count: number }>
    mcpGrantsTotal: number
    mcpGrantsActive: number
    deviceGrantsTotal: number
    deviceGrantsActive: number
    webhookEndpointsByStatus: Array<{ status: string; count: number }>
  }
  notifications: {
    deliveryByChannel7d: Array<{ channel: string; status: string; success: number; failure: number }>
    outboxByStatus: Array<{ status: string; count: number }>
    outboxPending: number
    webhookDeliveriesByStatus7d: Array<{ status: string; count: number }>
    recentWebhookFailures: Array<{
      id: string
      endpointId: string
      responseStatus: number | null
      error: string | null
      failedAt: string | null
      attemptCount: number
    }>
  }
}

type DailyCountRow = {
  day: Date | string
  count: bigint | number | string
}

type CountGroup<Key extends string> = Record<Key, string> & {
  _count: { _all: number }
}

type DeliveryGroup = {
  channel: string
  status: string
  _sum: { failureCount: number | null; successCount: number | null }
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dailyWindowStart(now: Date) {
  return new Date(startOfUtcDay(now).getTime() - (DAILY_WINDOW_DAYS - 1) * DAY_MS)
}

function countWindowStart(now: Date, days: number) {
  return new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS)
}

function normalizeDay(value: Date | string) {
  return value instanceof Date ? dayKey(value) : value.slice(0, 10)
}

function zeroFillDailyRows(rows: DailyCountRow[], now: Date): DailyPoint[] {
  const counts = new Map(rows.map((row) => [normalizeDay(row.day), Number(row.count)]))
  const start = dailyWindowStart(now)

  return Array.from({ length: DAILY_WINDOW_DAYS }, (_, index) => {
    const day = dayKey(new Date(start.getTime() + index * DAY_MS))
    return { day, count: counts.get(day) ?? 0 }
  })
}

function mapCountGroups<Key extends string>(rows: Array<CountGroup<Key>>, key: Key) {
  return rows.map((row) => ({ [key]: row[key], count: row._count._all })) as Array<
    Record<Key, string> & { count: number }
  >
}

function sortByFields<T>(rows: T[], fields: Array<Extract<keyof T, string>>) {
  return [...rows].sort((left, right) => {
    for (const field of fields) {
      const comparison = String(left[field]).localeCompare(String(right[field]))
      if (comparison !== 0) return comparison
    }
    return 0
  })
}

export async function getAdminStats(now: Date = new Date()): Promise<AdminStats> {
  const prisma = requirePrismaClient()
  const d7 = countWindowStart(now, 7)
  const d30 = dailyWindowStart(now)

  const [
    usersTotal,
    usersNew7d,
    usersNew30d,
    usersBanned,
    activeSessions,
    timersActive,
    timersArchived,
    projectsOwned,
    projectsOwnerless,
    pushSubscriptionsActive,
    apiKeysActive,
    apiKeysRevoked,
    apiKeysUsed7d,
    mcpGrantsTotal,
    mcpGrantsActive,
    deviceGrantsTotal,
    deviceGrantsActive,
    sharesTotal,
    apiKeysByKindRows,
    webhookEndpointsByStatusRows,
    outboxByStatusRows,
    outboxPending,
    deliveryByChannelRows,
    webhookDeliveriesByStatusRows,
    recentWebhookFailureRows,
    dailySignupRows,
    dailyTimerRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.user.count({ where: { banned: true } }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.timer.count({ where: { archivedAt: null } }),
    prisma.timer.count({ where: { archivedAt: { not: null } } }),
    prisma.project.count({ where: { ownerId: { not: null } } }),
    prisma.project.count({ where: { ownerId: null } }),
    prisma.webPushSubscription.count({ where: { revokedAt: null } }),
    prisma.apiKey.count({ where: { revokedAt: null } }),
    prisma.apiKey.count({ where: { revokedAt: { not: null } } }),
    prisma.apiKey.count({ where: { lastUsedAt: { gte: d7 }, revokedAt: null } }),
    prisma.mcpAuthorizationGrant.count(),
    prisma.mcpAuthorizationGrant.count({ where: { expiresAt: { gt: now } } }),
    prisma.deviceAuthorizationGrant.count(),
    prisma.deviceAuthorizationGrant.count({ where: { expiresAt: { gt: now } } }),
    prisma.share.count(),
    prisma.apiKey.groupBy({ by: ["kind"], _count: { _all: true } }),
    prisma.webhookEndpoint.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.notificationOutboxItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.notificationOutboxItem.count({ where: { status: "pending" } }),
    prisma.notificationDeliveryLog.groupBy({
      by: ["channel", "status"],
      where: { createdAt: { gte: d7 } },
      _sum: { successCount: true, failureCount: true },
    }),
    prisma.webhookDelivery.groupBy({
      by: ["status"],
      where: { createdAt: { gte: d7 } },
      _count: { _all: true },
    }),
    prisma.webhookDelivery.findMany({
      where: { status: "failed" },
      orderBy: { failedAt: "desc" },
      take: 10,
      select: {
        id: true,
        endpointId: true,
        responseStatus: true,
        error: true,
        failedAt: true,
        attemptCount: true,
      },
    }),
    prisma.$queryRaw<DailyCountRow[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM "user" WHERE "createdAt" >= ${d30}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<DailyCountRow[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM "timer" WHERE "createdAt" >= ${d30}
      GROUP BY 1 ORDER BY 1
    `,
  ])

  const deliveryByChannel7d = sortByFields(
    (deliveryByChannelRows as DeliveryGroup[]).map((row) => ({
      channel: row.channel,
      status: row.status,
      success: row._sum.successCount ?? 0,
      failure: row._sum.failureCount ?? 0,
    })),
    ["channel", "status"],
  )

  return {
    generatedAt: now.toISOString(),
    users: {
      total: usersTotal,
      new7d: usersNew7d,
      new30d: usersNew30d,
      banned: usersBanned,
      activeSessions,
      dailySignups: zeroFillDailyRows(dailySignupRows, now),
    },
    usage: {
      timersActive,
      timersArchived,
      dailyTimersCreated: zeroFillDailyRows(dailyTimerRows, now),
      projectsOwned,
      projectsOwnerless,
      sharesTotal,
      pushSubscriptionsActive,
    },
    integrations: {
      apiKeysActive,
      apiKeysRevoked,
      apiKeysUsed7d,
      apiKeysByKind: sortByFields(mapCountGroups(apiKeysByKindRows as Array<CountGroup<"kind">>, "kind"), ["kind"]),
      mcpGrantsTotal,
      mcpGrantsActive,
      deviceGrantsTotal,
      deviceGrantsActive,
      webhookEndpointsByStatus: sortByFields(
        mapCountGroups(webhookEndpointsByStatusRows as Array<CountGroup<"status">>, "status"),
        ["status"],
      ),
    },
    notifications: {
      deliveryByChannel7d,
      outboxByStatus: sortByFields(mapCountGroups(outboxByStatusRows as Array<CountGroup<"status">>, "status"), [
        "status",
      ]),
      outboxPending,
      webhookDeliveriesByStatus7d: sortByFields(
        mapCountGroups(webhookDeliveriesByStatusRows as Array<CountGroup<"status">>, "status"),
        ["status"],
      ),
      recentWebhookFailures: recentWebhookFailureRows.map((row) => ({
        id: row.id,
        endpointId: row.endpointId,
        responseStatus: row.responseStatus,
        error: row.error,
        failedAt: row.failedAt?.toISOString() ?? null,
        attemptCount: row.attemptCount,
      })),
    },
  }
}

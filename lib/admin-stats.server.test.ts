import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

function countDelegate() {
  return {
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn().mockResolvedValue([]),
    findMany: vi.fn().mockResolvedValue([]),
  }
}

function createPrismaMock() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    apiKey: countDelegate(),
    deviceAuthorizationGrant: countDelegate(),
    mcpAuthorizationGrant: countDelegate(),
    notificationDeliveryLog: countDelegate(),
    notificationOutboxItem: countDelegate(),
    project: countDelegate(),
    session: countDelegate(),
    share: countDelegate(),
    timer: countDelegate(),
    user: countDelegate(),
    webPushSubscription: countDelegate(),
    webhookDelivery: countDelegate(),
    webhookEndpoint: countDelegate(),
  }
}

describe("admin stats", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.requirePrismaClient.mockReset()
  })

  it("returns the aggregate stats shape with grouped rows and serialized failures", async () => {
    const prisma = createPrismaMock()
    prisma.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
    prisma.session.count.mockResolvedValueOnce(3)
    prisma.timer.count.mockResolvedValueOnce(8).mockResolvedValueOnce(5)
    prisma.project.count.mockResolvedValueOnce(6).mockResolvedValueOnce(7)
    prisma.webPushSubscription.count.mockResolvedValueOnce(9)
    prisma.apiKey.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1).mockResolvedValueOnce(2)
    prisma.mcpAuthorizationGrant.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3)
    prisma.deviceAuthorizationGrant.count.mockResolvedValueOnce(7).mockResolvedValueOnce(4)
    prisma.share.count.mockResolvedValueOnce(4)
    prisma.apiKey.groupBy.mockResolvedValueOnce([{ kind: "api_key", _count: { _all: 4 } }])
    prisma.webhookEndpoint.groupBy.mockResolvedValueOnce([{ status: "active", _count: { _all: 6 } }])
    prisma.notificationOutboxItem.groupBy.mockResolvedValueOnce([{ status: "pending", _count: { _all: 11 } }])
    prisma.notificationOutboxItem.count.mockResolvedValueOnce(11)
    prisma.notificationDeliveryLog.groupBy.mockResolvedValueOnce([
      { channel: "email", status: "sent", _sum: { successCount: 5, failureCount: 0 } },
      { channel: "sms", status: "failed", _sum: { successCount: null, failureCount: 2 } },
    ])
    prisma.webhookDelivery.groupBy.mockResolvedValueOnce([{ status: "failed", _count: { _all: 2 } }])
    prisma.webhookDelivery.findMany.mockResolvedValueOnce([
      {
        id: "delivery_1",
        endpointId: "endpoint_1",
        responseStatus: 500,
        error: "HTTP 500",
        failedAt: new Date("2026-07-07T10:00:00.000Z"),
        attemptCount: 3,
      },
    ])
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { getAdminStats } = await import("./admin-stats.server")

    const stats = await getAdminStats(new Date("2026-07-07T12:00:00.000Z"))

    expect(prisma.project.count).toHaveBeenNthCalledWith(1, { where: { ownerId: { not: null } } })
    expect(prisma.project.count).toHaveBeenNthCalledWith(2, { where: { ownerId: null } })
    expect(stats).toMatchObject({
      generatedAt: "2026-07-07T12:00:00.000Z",
      users: { total: 10, new7d: 2, new30d: 4, banned: 1, activeSessions: 3 },
      usage: {
        timersActive: 8,
        timersArchived: 5,
        projectsOwned: 6,
        projectsOwnerless: 7,
        sharesTotal: 4,
        pushSubscriptionsActive: 9,
      },
      integrations: {
        apiKeysActive: 4,
        apiKeysRevoked: 1,
        apiKeysUsed7d: 2,
        apiKeysByKind: [{ kind: "api_key", count: 4 }],
        mcpGrantsTotal: 5,
        mcpGrantsActive: 3,
        deviceGrantsTotal: 7,
        deviceGrantsActive: 4,
        webhookEndpointsByStatus: [{ status: "active", count: 6 }],
      },
      notifications: {
        deliveryByChannel7d: [
          { channel: "email", status: "sent", success: 5, failure: 0 },
          { channel: "sms", status: "failed", success: 0, failure: 2 },
        ],
        outboxByStatus: [{ status: "pending", count: 11 }],
        outboxPending: 11,
        webhookDeliveriesByStatus7d: [{ status: "failed", count: 2 }],
        recentWebhookFailures: [
          {
            id: "delivery_1",
            endpointId: "endpoint_1",
            responseStatus: 500,
            error: "HTTP 500",
            failedAt: "2026-07-07T10:00:00.000Z",
            attemptCount: 3,
          },
        ],
      },
    })
    expect(mocks.requirePrismaClient).toHaveBeenCalledTimes(1)
  })

  it("zero-fills daily series to 30 UTC days ending on now", async () => {
    const prisma = createPrismaMock()
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { day: "2026-06-08", count: 2 },
        { day: "2026-07-07", count: 5 },
      ])
      .mockResolvedValueOnce([{ day: "2026-06-09", count: 4 }])
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { getAdminStats } = await import("./admin-stats.server")

    const stats = await getAdminStats(new Date("2026-07-07T23:59:00.000Z"))

    expect(stats.users.dailySignups).toHaveLength(30)
    expect(stats.users.dailySignups[0]).toEqual({ day: "2026-06-08", count: 2 })
    expect(stats.users.dailySignups[1]).toEqual({ day: "2026-06-09", count: 0 })
    expect(stats.users.dailySignups[29]).toEqual({ day: "2026-07-07", count: 5 })
    expect(stats.usage.dailyTimersCreated).toHaveLength(30)
    expect(stats.usage.dailyTimersCreated[1]).toEqual({ day: "2026-06-09", count: 4 })
  })

  it("uses raw SQL for the daily series", async () => {
    const prisma = createPrismaMock()
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { getAdminStats } = await import("./admin-stats.server")

    await getAdminStats(new Date("2026-07-07T12:00:00.000Z"))

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountExportSchema } from "@/lib/account-migration"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  requirePrismaClient: vi.fn(),
  prisma: {
    apiKey: { findMany: vi.fn() },
    inAppNotification: { findMany: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    userPreference: { findUnique: vi.fn() },
    webhookEndpoint: { findMany: vi.fn() },
    webPushSubscription: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

const actor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }
const otherUserId = "user_other"
const dates = {
  createdAt: new Date("2026-07-01T10:00:00.000Z"),
  updatedAt: new Date("2026-07-01T11:00:00.000Z"),
  lastUsedAt: new Date("2026-07-02T12:00:00.000Z"),
  lastSeenAt: new Date("2026-07-03T12:00:00.000Z"),
}
const realWebhookSecret = "whsec_real_secret_value"
const realApiKeyToken = "tw_real_token_value"
const realApiKeyHash = "real_key_hash_value"
const fullPushEndpoint = "https://push.example.test/send/user_123/subscription_456?token=secret"

function resetPrismaMocks() {
  mocks.prisma.apiKey.findMany.mockReset()
  mocks.prisma.inAppNotification.findMany.mockReset()
  mocks.prisma.notificationPreference.findMany.mockReset()
  mocks.prisma.project.findMany.mockReset()
  mocks.prisma.user.findUnique.mockReset()
  mocks.prisma.userPreference.findUnique.mockReset()
  mocks.prisma.webhookEndpoint.findMany.mockReset()
  mocks.prisma.webPushSubscription.findMany.mockReset()
}

function seedExportRows() {
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: actor.user.id,
    email: "ada@example.com",
    name: "Ada",
    createdAt: dates.createdAt,
  })
  mocks.prisma.project.findMany.mockResolvedValue([
    {
      id: "project_123",
      name: "Launch",
      color: "blue",
      snapshot: { version: 2, name: "Launch", timers: [], spaces: [], updatedAt: "2026-07-01T00:00:00.000Z" },
      createdAt: dates.createdAt,
      updatedAt: dates.updatedAt,
      claimedAt: null,
    },
  ])
  mocks.prisma.userPreference.findUnique.mockResolvedValue({
    defaultTimezone: "Europe/Warsaw",
    emailReminders: true,
    fullPageAlarm: false,
    inAppNotifications: true,
    notificationSound: "chord",
  })
  mocks.prisma.notificationPreference.findMany.mockResolvedValue([
    {
      id: "pref_123",
      targetType: "user",
      targetId: "global",
      channels: { in_app: true, push: true },
      presentation: { sound: "polite" },
      createdAt: dates.createdAt,
      updatedAt: dates.updatedAt,
    },
  ])
  mocks.prisma.webhookEndpoint.findMany.mockResolvedValue([
    {
      id: "wh_123",
      name: "Production",
      url: "https://hooks.example.test/tickward",
      secret: realWebhookSecret,
      eventTypes: ["timer.ended"],
      status: "active",
      failureCount: 0,
      createdAt: dates.createdAt,
      updatedAt: dates.updatedAt,
      disabledAt: null,
      lastDeliveredAt: null,
      lastFailedAt: null,
    },
  ])
  mocks.prisma.apiKey.findMany.mockResolvedValue([
    {
      name: "Production",
      permission: "read",
      token: realApiKeyToken,
      keyHash: realApiKeyHash,
      keyPrefix: "tw_real_",
      keyLast4: "alue",
      createdAt: dates.createdAt,
      lastUsedAt: dates.lastUsedAt,
    },
  ])
  mocks.prisma.webPushSubscription.findMany.mockResolvedValue([
    {
      id: "push_123",
      endpoint: fullPushEndpoint,
      expirationTime: BigInt(1234567890),
      p256dh: "real-p256dh-key",
      auth: "real-auth-key",
      userAgent: "Unit Test",
      createdAt: dates.createdAt,
      updatedAt: dates.updatedAt,
      revokedAt: null,
      lastSeenAt: dates.lastSeenAt,
    },
  ])
  mocks.prisma.inAppNotification.findMany.mockResolvedValue([
    {
      id: "inbox_123",
      transactionId: "txn_123",
      type: "timer.reminder",
      timerId: "timer_123",
      projectId: "project_123",
      payload: { label: "Launch" },
      readAt: null,
      createdAt: dates.createdAt,
    },
  ])
}

describe("/api/account/export", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: { "ratelimit-limit": "2" } })
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.requirePrismaClient.mockReset()
    mocks.requirePrismaClient.mockReturnValue(mocks.prisma)
    resetPrismaMocks()
    seedExportRows()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("./route")
    mocks.getCurrentActor.mockResolvedValueOnce({ kind: "anonymous", restoreKey: "restore_123" })

    const res = await GET(new Request("https://tickward.test/api/account/export"))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "unauthorized" } })
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("returns 429 when the account export bucket denies the request", async () => {
    const { GET } = await import("./route")
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, headers: { "retry-after": "60" } })

    const res = await GET(new Request("https://tickward.test/api/account/export"))

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("60")
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("account-export", "user:user_123")
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("returns the export payload with attachment headers", async () => {
    const { GET } = await import("./route")

    const res = await GET(new Request("https://tickward.test/api/account/export"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="tickward-export-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    expect(Object.keys(body).sort()).toEqual(
      [
        "apiKeys",
        "accountPreferences",
        "exportedAt",
        "format",
        "inboxNotifications",
        "notificationPreferences",
        "projects",
        "pushSubscriptions",
        "user",
        "version",
        "webhookEndpoints",
      ].sort(),
    )
    expect(body).toMatchObject({ format: "tickward-account", version: 1 })
    expect(accountExportSchema.safeParse(body).success).toBe(true)
    expect(body.user).toMatchObject({
      id: "user_123",
      email: "ada@example.com",
      name: "Ada",
      createdAt: dates.createdAt.toISOString(),
    })
    expect(body.projects).toHaveLength(1)
    expect(body.accountPreferences).toEqual({
      object: "account_preferences",
      default_timezone: "Europe/Warsaw",
      email_reminders: true,
      full_page_alarm: false,
      in_app_notifications: true,
      notification_sound: "chord",
    })
    expect(body.notificationPreferences).toHaveLength(1)
    expect(body.webhookEndpoints).toHaveLength(1)
    expect(body.apiKeys).toHaveLength(1)
    expect(body.pushSubscriptions).toHaveLength(1)
    expect(body.inboxNotifications).toHaveLength(1)
  })

  it("fully masks webhook secrets", async () => {
    const { GET } = await import("./route")

    const res = await GET(new Request("https://tickward.test/api/account/export"))
    const serialized = await res.text()

    expect(serialized).toContain('"secret":"********"')
    expect(serialized).not.toContain(realWebhookSecret)
  })

  it("exports default account preferences when no preference row exists", async () => {
    const { GET } = await import("./route")
    mocks.prisma.userPreference.findUnique.mockResolvedValueOnce(null)

    const res = await GET(new Request("https://tickward.test/api/account/export"))
    const body = await res.json()

    expect(body.accountPreferences).toEqual({
      object: "account_preferences",
      default_timezone: null,
      email_reminders: false,
      full_page_alarm: true,
      in_app_notifications: true,
      notification_sound: "polite",
    })
  })

  it("omits API key token and hash material", async () => {
    const { GET } = await import("./route")

    const res = await GET(new Request("https://tickward.test/api/account/export"))
    const serialized = await res.text()
    const body = JSON.parse(serialized)

    expect(body.apiKeys[0]).toEqual({
      name: "Production",
      permission: "read",
      createdAt: dates.createdAt.toISOString(),
      lastUsedAt: dates.lastUsedAt.toISOString(),
    })
    expect(body.apiKeys[0]).not.toHaveProperty("token")
    expect(body.apiKeys[0]).not.toHaveProperty("keyHash")
    expect(body.apiKeys[0]).not.toHaveProperty("keyPrefix")
    expect(body.apiKeys[0]).not.toHaveProperty("keyLast4")
    expect(serialized).not.toContain(realApiKeyToken)
    expect(serialized).not.toContain(realApiKeyHash)
  })

  it("reduces push subscription endpoints to origins", async () => {
    const { GET } = await import("./route")

    const res = await GET(new Request("https://tickward.test/api/account/export"))
    const serialized = await res.text()
    const body = JSON.parse(serialized)

    expect(body.pushSubscriptions[0]).toMatchObject({
      id: "push_123",
      endpointOrigin: "https://push.example.test",
    })
    expect(body.pushSubscriptions[0]).not.toHaveProperty("endpoint")
    expect(body.pushSubscriptions[0]).not.toHaveProperty("p256dh")
    expect(body.pushSubscriptions[0]).not.toHaveProperty("auth")
    expect(serialized).not.toContain("/send/user_123/subscription_456")
    expect(serialized).not.toContain("real-p256dh-key")
    expect(serialized).not.toContain("real-auth-key")
  })

  it("scopes every storage query by the signed-in user id", async () => {
    const { GET } = await import("./route")
    const projects = [
      {
        id: "project_123",
        ownerId: actor.user.id,
        name: "Launch",
        color: null,
        snapshot: { version: 2, name: "Launch", timers: [], spaces: [], updatedAt: "2026-07-01T00:00:00.000Z" },
        createdAt: dates.createdAt,
        updatedAt: dates.updatedAt,
        claimedAt: null,
      },
      {
        id: "project_other",
        ownerId: otherUserId,
        name: "Other Account",
        color: null,
        snapshot: { version: 2, name: "Other Account", timers: [], spaces: [], updatedAt: "2026-07-01T00:00:00.000Z" },
        createdAt: dates.createdAt,
        updatedAt: dates.updatedAt,
        claimedAt: null,
      },
    ]
    mocks.prisma.project.findMany.mockImplementationOnce(async (args) =>
      projects.filter((project) => project.ownerId === args.where.ownerId),
    )

    const res = await GET(new Request("https://tickward.test/api/account/export"))
    const serialized = await res.text()
    const body = JSON.parse(serialized)

    expect(body.projects).toHaveLength(1)
    expect(body.projects[0].id).toBe("project_123")
    expect(serialized).not.toContain("project_other")
    expect(serialized).not.toContain("Other Account")
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user_123" } }))
    expect(mocks.prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "user_123" } }),
    )
    expect(mocks.prisma.userPreference.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_123" } }),
    )
    expect(mocks.prisma.notificationPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_123" } }),
    )
    expect(mocks.prisma.webhookEndpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_123" } }),
    )
    expect(mocks.prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: "api_key", userId: "user_123" } }),
    )
    expect(mocks.prisma.webPushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_123" } }),
    )
    expect(mocks.prisma.inAppNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_123" } }),
    )
  })

  it("returns a controlled storage error when export storage is unavailable", async () => {
    const { GET } = await import("./route")
    mocks.prisma.user.findUnique.mockRejectedValueOnce(new Error("database unavailable"))

    const res = await GET(new Request("https://tickward.test/api/account/export"))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      error: { type: "storage_unavailable", message: "Account export storage is unavailable." },
    })
  })
})

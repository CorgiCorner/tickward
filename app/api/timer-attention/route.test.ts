import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  prisma: {
    project: { findMany: vi.fn() },
    projectAccessToken: { findFirst: vi.fn() },
    timer: { findMany: vi.fn() },
    userPreference: { findUnique: vi.fn() },
    countUpOccurrence: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({ getCurrentActor: mocks.getCurrentActor }))
vi.mock("@/lib/db/prisma.server", () => ({ requirePrismaClient: mocks.requirePrismaClient }))
vi.mock("@/lib/rate-limit.server", () => ({ checkRateLimit: mocks.checkRateLimit }))

const user = { id: "user_123", email: "ada@example.test" }
const actor = { kind: "user" as const, user }
const project = { id: "project_123", name: "Launch plan" }
const targetAtMs = Date.parse("2026-07-16T10:00:00.000Z")
const key = `timer_123|${targetAtMs}`
const occurrence = {
  id: "count_up_123",
  userId: user.id,
  projectId: project.id,
  timerId: "timer_123",
  targetAtMs: BigInt(targetAtMs),
  crossedAt: new Date(targetAtMs),
  firstSeenAt: null,
  reviewExpiresAt: null,
  acknowledgedAt: null,
  deferredUntil: null,
  policyMode: "until-i-move-it",
  policyMinutes: null,
  usesDefaultPolicy: true,
}
const timer = {
  id: "timer_123",
  projectId: project.id,
  archivedAt: null,
  data: { label: "Ship launch", pinned: true, targetDate: new Date(targetAtMs).toISOString() },
}

function post(body: unknown) {
  return new Request("https://app.example.test/api/timer-attention", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

function wire(overrides: Record<string, unknown> = {}) {
  return {
    key,
    projectId: project.id,
    projectName: project.name,
    timer: { label: "Ship launch", pinned: true },
    timerId: occurrence.timerId,
    targetAtMs: String(targetAtMs),
    crossedAt: occurrence.crossedAt.toISOString(),
    firstSeenAt: null,
    reviewExpiresAt: null,
    acknowledgedAt: null,
    deferredUntil: null,
    policy: { mode: "until-i-move-it", minutes: null },
    usesDefaultPolicy: true,
    ...overrides,
  }
}

describe("/api/timer-attention", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-16T12:00:00.000Z"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.requirePrismaClient.mockReset()
    mocks.requirePrismaClient.mockReturnValue(mocks.prisma)
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {}, retryAfter: 0 })
    mocks.prisma.project.findMany.mockReset()
    mocks.prisma.project.findMany.mockResolvedValue([project])
    mocks.prisma.projectAccessToken.findFirst.mockReset()
    mocks.prisma.projectAccessToken.findFirst.mockResolvedValue(null)
    mocks.prisma.timer.findMany.mockReset()
    mocks.prisma.timer.findMany.mockResolvedValue([timer])
    mocks.prisma.userPreference.findUnique.mockReset()
    mocks.prisma.userPreference.findUnique.mockResolvedValue(null)
    mocks.prisma.countUpOccurrence.createMany.mockReset()
    mocks.prisma.countUpOccurrence.createMany.mockResolvedValue({ count: 0 })
    mocks.prisma.countUpOccurrence.deleteMany.mockReset()
    mocks.prisma.countUpOccurrence.deleteMany.mockResolvedValue({ count: 0 })
    mocks.prisma.countUpOccurrence.findFirst.mockReset()
    mocks.prisma.countUpOccurrence.findFirst.mockResolvedValue(null)
    mocks.prisma.countUpOccurrence.findMany.mockReset()
    mocks.prisma.countUpOccurrence.findMany.mockResolvedValue([])
    mocks.prisma.countUpOccurrence.updateMany.mockReset()
    mocks.prisma.countUpOccurrence.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.countUpOccurrence.upsert.mockReset()
    mocks.prisma.countUpOccurrence.upsert.mockResolvedValue(occurrence)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("backfills project identity and scopes database uniqueness without changing the stable wire key", () => {
    const migration = readFileSync(
      join(process.cwd(), "prisma/migrations/20260716200000_timer_attention_project_scope/migration.sql"),
      "utf8",
    )
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8")

    expect(migration).toContain('ALTER TABLE "timer_attention_event" ADD COLUMN "projectId" TEXT')
    expect(migration).toContain('timer."id" = event."timerId"')
    expect(migration).toContain('event."targetAtMs"')
    expect(migration).toContain('DELETE FROM "timer_attention_event" WHERE "projectId" IS NULL')
    expect(migration).toContain('FOREIGN KEY ("projectId", "timerId") REFERENCES "timer"("projectId", "id")')
    expect(schema).toContain("@@unique([userId, projectId, timerId, targetAtMs])")
    expect(
      readFileSync(
        join(process.cwd(), "prisma/migrations/20260716213000_attention_occurrence_project_identity/migration.sql"),
        "utf8",
      ),
    ).toContain('"userId", "projectId", "timerId", "targetAtMs"')

    const reviewMigration = readFileSync(
      join(process.cwd(), "prisma/migrations/20260717193000_count_up_review_deadlines/migration.sql"),
      "utf8",
    )
    expect(reviewMigration).toContain('ADD COLUMN "reviewExpiresAt" TIMESTAMP(3)')
    expect(reviewMigration).toContain('WHEN "firstSeenAt" IS NULL THEN NULL')
    expect(reviewMigration).toContain('WHEN "deferredUntil" IS NOT NULL THEN "deferredUntil"')
    expect(reviewMigration).toContain("\"firstSeenAt\" + INTERVAL '15 minutes'")
    expect(reviewMigration).toContain('ADD COLUMN "usesDefaultPolicy" BOOLEAN NOT NULL DEFAULT true')
  })

  it("discovers only recent, naturally crossed timers across accessible projects", async () => {
    const nowMs = Date.parse("2026-07-16T12:00:00.000Z")
    const eligibleTimer = {
      ...timer,
      createdAt: new Date(targetAtMs - 60_000),
      updatedAt: new Date(targetAtMs - 30_000),
    }
    const oldTargetAtMs = nowMs - 49 * 60 * 60 * 1000
    const oldTimer = {
      ...eligibleTimer,
      id: "timer-old",
      data: { ...timer.data, targetDate: new Date(oldTargetAtMs).toISOString() },
      createdAt: new Date(oldTargetAtMs - 60_000),
      updatedAt: new Date(oldTargetAtMs - 30_000),
    }
    const pastCreatedTimer = {
      ...eligibleTimer,
      id: "timer-past-created",
      createdAt: new Date(targetAtMs + 1),
    }
    mocks.prisma.timer.findMany
      .mockResolvedValueOnce([eligibleTimer, oldTimer, pastCreatedTimer])
      .mockResolvedValueOnce([eligibleTimer])
    mocks.prisma.countUpOccurrence.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([occurrence])
    mocks.prisma.userPreference.findUnique.mockResolvedValue({
      countUpPolicy: "after-seen-15m",
      countUpPolicyMinutes: null,
    })
    const { GET } = await import("./route")

    const response = await GET(new Request("https://app.example.test/api/timer-attention"))

    expect(response.status).toBe(200)
    expect(mocks.prisma.countUpOccurrence.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: user.id,
          projectId: project.id,
          timerId: eligibleTimer.id,
          targetAtMs: BigInt(targetAtMs),
          crossedAt: new Date(targetAtMs),
          firstSeenAt: null,
          policyMode: "after-seen-15m",
        }),
      ],
      skipDuplicates: true,
    })
  })

  it("lists project-groupable events for only the signed-in user using JSON-safe timestamps and a stable key", async () => {
    mocks.prisma.countUpOccurrence.findMany.mockResolvedValueOnce([occurrence]).mockResolvedValueOnce([occurrence])
    const { GET } = await import("./route")

    const response = await GET(new Request("https://app.example.test/api/timer-attention"))

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    await expect(response.json()).resolves.toEqual({ events: [wire()] })
    expect(mocks.prisma.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: user.id },
      select: { id: true, name: true },
    })
    expect(mocks.prisma.countUpOccurrence.findMany).toHaveBeenNthCalledWith(1, { where: { userId: user.id } })
    expect(mocks.prisma.countUpOccurrence.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { userId: user.id, projectId: { in: [project.id] } } }),
    )
    expect(key).toBe(`timer_123|${targetAtMs}`)
  })

  it("prunes occurrences whose exact project timer moved to the future, was archived, or was deleted", async () => {
    const { GET } = await import("./route")

    const timerStates = [
      [{ ...timer, data: { targetDate: "2026-07-17T10:00:00.000Z" } }],
      [{ ...timer, archivedAt: new Date("2026-07-16T11:00:00.000Z") }],
      [],
    ]
    for (const timerRows of timerStates) {
      mocks.prisma.countUpOccurrence.findMany.mockResolvedValueOnce([occurrence]).mockResolvedValueOnce([])
      mocks.prisma.timer.findMany.mockResolvedValueOnce(timerRows)
      await GET(new Request("https://app.example.test/api/timer-attention"))
    }

    expect(mocks.prisma.countUpOccurrence.deleteMany).toHaveBeenCalledTimes(3)
    expect(mocks.prisma.countUpOccurrence.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: [occurrence.id] }, userId: user.id, projectId: { in: [project.id] } },
    })
  })

  it("creates an occurrence only for a current non-recurring timer and derives crossedAt from its target", async () => {
    const { POST } = await import("./route")

    const response = await POST(
      post({
        action: "create",
        events: [wire({ crossedAt: "2026-07-15T00:00:00.000Z", firstSeenAt: "2026-07-16T11:00:00.000Z" })],
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.countUpOccurrence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: user.id,
          projectId: project.id,
          targetAtMs: BigInt(targetAtMs),
          crossedAt: new Date(targetAtMs),
          firstSeenAt: new Date("2026-07-16T11:00:00.000Z"),
          policyMode: "until-i-move-it",
          policyMinutes: null,
        }),
        where: {
          userId_projectId_timerId_targetAtMs: {
            userId: user.id,
            projectId: project.id,
            timerId: occurrence.timerId,
            targetAtMs: BigInt(targetAtMs),
          },
        },
      }),
    )
    expect(mocks.prisma.timer.findMany).toHaveBeenCalledWith({
      where: { OR: [{ projectId: project.id, id: occurrence.timerId }] },
      select: {
        id: true,
        projectId: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        data: true,
      },
    })
  })

  it("allows a signed user to create per-user state through an active restore-key project access", async () => {
    mocks.getCurrentActor.mockResolvedValue({ ...actor, restoreKey: "restoreKey_shared" })
    mocks.prisma.project.findMany.mockResolvedValue([])
    mocks.prisma.projectAccessToken.findFirst.mockResolvedValue({ project })
    const { POST } = await import("./route")

    const response = await POST(post({ action: "create", events: [wire()] }))

    expect(response.status).toBe(200)
    expect(mocks.prisma.projectAccessToken.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tokenHash: expect.any(String),
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date("2026-07-16T12:00:00.000Z") } }],
      }),
      select: { project: { select: { id: true, name: true } } },
    })
    expect(mocks.prisma.countUpOccurrence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ userId: user.id, projectId: project.id }) }),
    )
  })

  it("denies creation for a foreign project without owned or active restore-key access", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([])
    const { POST } = await import("./route")

    const response = await POST(post({ action: "create", events: [wire()] }))

    expect(response.status).toBe(200)
    expect(mocks.prisma.timer.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.countUpOccurrence.upsert).not.toHaveBeenCalled()
  })

  it("omits an inaccessible shared-project occurrence without deleting the user's stored state", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([])
    mocks.prisma.countUpOccurrence.findMany.mockResolvedValueOnce([occurrence])
    const { GET } = await import("./route")

    const response = await GET(new Request("https://app.example.test/api/timer-attention"))

    await expect(response.json()).resolves.toEqual({ events: [] })
    expect(mocks.prisma.timer.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.countUpOccurrence.deleteMany).not.toHaveBeenCalled()
  })

  it("keeps the first-seen deadline stable and merges acknowledgedAt by latest timestamp", async () => {
    const existingFirstSeenAt = new Date("2026-07-16T10:00:00.000Z")
    const existingReviewExpiresAt = new Date("2026-07-16T10:15:00.000Z")
    const incomingFirstSeenAt = "2026-07-16T10:30:00.000Z"
    const incomingAcknowledgedAt = "2026-07-16T11:30:00.000Z"
    mocks.prisma.countUpOccurrence.findFirst.mockResolvedValue({
      ...occurrence,
      firstSeenAt: existingFirstSeenAt,
      reviewExpiresAt: existingReviewExpiresAt,
      acknowledgedAt: new Date("2026-07-16T11:00:00.000Z"),
    })
    const { POST } = await import("./route")

    await POST(
      post({
        action: "create",
        events: [wire({ firstSeenAt: incomingFirstSeenAt, acknowledgedAt: incomingAcknowledgedAt })],
      }),
    )

    expect(mocks.prisma.countUpOccurrence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { acknowledgedAt: new Date(incomingAcknowledgedAt) } }),
    )
    expect(existingFirstSeenAt).toEqual(new Date("2026-07-16T10:00:00.000Z"))
    expect(existingReviewExpiresAt).toEqual(new Date("2026-07-16T10:15:00.000Z"))
  })

  it("stores a colliding stable key independently in each project", async () => {
    mocks.prisma.countUpOccurrence.findFirst.mockResolvedValue({ ...occurrence, projectId: "project_other" })
    const { POST } = await import("./route")

    await POST(post({ action: "create", events: [wire()] }))

    expect(mocks.prisma.countUpOccurrence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_projectId_timerId_targetAtMs: expect.objectContaining({ projectId: project.id }),
        },
      }),
    )
  })

  it("rejects creation for recurring, archived, future, and unknown timers", async () => {
    const variants = [
      { ...timer, data: { ...timer.data, recurrence: { enabled: true } } },
      { ...timer, archivedAt: new Date() },
      { ...timer, data: { targetDate: "2026-07-17T10:00:00.000Z" } },
    ]
    const { POST } = await import("./route")

    for (const invalidTimer of variants) {
      mocks.prisma.timer.findMany.mockResolvedValueOnce([invalidTimer])
      await POST(post({ action: "create", events: [wire()] }))
    }
    mocks.prisma.timer.findMany.mockResolvedValueOnce([])
    await POST(post({ action: "create", events: [wire()] }))

    expect(mocks.prisma.countUpOccurrence.upsert).not.toHaveBeenCalled()
  })

  it("scopes markSeen, acknowledge, unacknowledge, defer, and close mutations to the session user", async () => {
    mocks.prisma.countUpOccurrence.findMany.mockImplementation(({ where }: { where?: { OR?: unknown } }) =>
      Promise.resolve(where?.OR ? [occurrence] : []),
    )
    const { POST } = await import("./route")
    const actions = [
      { action: "markSeen", keys: [key], projectId: project.id },
      { action: "acknowledge", keys: [key], projectId: project.id },
      { action: "unacknowledge", keys: [key], projectId: project.id },
      { action: "defer", keys: [key], untilMs: targetAtMs + 60_000, projectId: project.id },
      { action: "close", keys: [key], projectId: project.id },
    ]

    for (const action of actions) await POST(post(action))

    expect(mocks.prisma.countUpOccurrence.updateMany).toHaveBeenCalledTimes(4)
    expect(mocks.prisma.countUpOccurrence.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: user.id,
        projectId: project.id,
        OR: [{ timerId: occurrence.timerId, targetAtMs: BigInt(targetAtMs) }],
      }),
    })
    expect(mocks.prisma.countUpOccurrence.updateMany).toHaveBeenCalledWith({
      where: { id: occurrence.id, firstSeenAt: null },
      data: { firstSeenAt: new Date("2026-07-16T12:00:00.000Z"), reviewExpiresAt: null },
    })
    expect(mocks.prisma.countUpOccurrence.updateMany).toHaveBeenCalledWith({
      where: { id: occurrence.id },
      data: {
        firstSeenAt: new Date("2026-07-16T12:00:00.000Z"),
        acknowledgedAt: null,
        deferredUntil: null,
        reviewExpiresAt: null,
      },
    })
    expect(mocks.prisma.countUpOccurrence.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: user.id, projectId: project.id }),
      }),
    )
  })

  it("does not create server state for a direct-to-Past occurrence", async () => {
    const { POST } = await import("./route")

    await POST(
      post({
        action: "create",
        events: [wire({ policy: { mode: "move-directly-to-past", minutes: null } })],
      }),
    )

    expect(mocks.prisma.countUpOccurrence.upsert).not.toHaveBeenCalled()
  })

  it("defers without bypassing the visibility dwell and keeps an until-moved override", async () => {
    const { POST } = await import("./route")

    await POST(post({ action: "defer", keys: [key], untilMs: null }))

    expect(mocks.prisma.countUpOccurrence.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.countUpOccurrence.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: user.id }),
      data: { deferredUntil: null, policyMode: "until-i-move-it", policyMinutes: null, reviewExpiresAt: null },
    })
  })

  it("re-arms an unacknowledged custom occurrence from the server clock", async () => {
    mocks.prisma.countUpOccurrence.findMany.mockImplementation(({ where }: { where?: { OR?: unknown } }) =>
      Promise.resolve(
        where?.OR
          ? [
              {
                ...occurrence,
                firstSeenAt: new Date("2026-07-16T11:00:00.000Z"),
                policyMode: "custom",
                policyMinutes: 2,
              },
            ]
          : [],
      ),
    )
    const { POST } = await import("./route")

    await POST(post({ action: "unacknowledge", keys: [key], projectId: project.id }))

    expect(mocks.prisma.countUpOccurrence.updateMany).toHaveBeenCalledWith({
      where: { id: occurrence.id },
      data: {
        firstSeenAt: new Date("2026-07-16T11:00:00.000Z"),
        acknowledgedAt: null,
        deferredUntil: null,
        reviewExpiresAt: new Date("2026-07-16T12:02:00.000Z"),
      },
    })
  })

  it("persists auto-expiry and never expires an unseen occurrence", async () => {
    const seenExpired = {
      ...occurrence,
      firstSeenAt: new Date("2026-07-16T11:50:00.000Z"),
      reviewExpiresAt: new Date("2026-07-16T11:55:00.000Z"),
      policyMode: "after-seen-5m",
    }
    const unseen = { ...occurrence, id: "count_up_456" }
    mocks.prisma.countUpOccurrence.findMany
      .mockResolvedValueOnce([seenExpired, unseen])
      .mockResolvedValueOnce([seenExpired, unseen])
    const { GET } = await import("./route")

    const response = await GET(new Request("https://app.example.test/api/timer-attention"))

    expect(response.status).toBe(200)
    expect(mocks.prisma.countUpOccurrence.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [seenExpired.id] },
        userId: user.id,
        projectId: { in: [project.id] },
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: new Date("2026-07-16T12:00:00.000Z") },
    })
    const body = await response.json()
    expect(body.events[0].acknowledgedAt).toBe("2026-07-16T12:00:00.000Z")
    expect(body.events[1].acknowledgedAt).toBeNull()
  })

  it("requires authentication before reading storage", async () => {
    mocks.getCurrentActor.mockRejectedValueOnce(new Error("missing session"))
    const { GET } = await import("./route")

    const response = await GET(new Request("https://app.example.test/api/timer-attention"))

    expect(response.status).toBe(401)
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("rejects malformed actions and keys without mutating another record", async () => {
    const { POST } = await import("./route")

    const invalidAction = await POST(post({ action: "acknowledge", keys: "not-an-array" }))
    const invalidKey = await POST(post({ action: "acknowledge", keys: ["not-an-occurrence-key"] }))

    expect(invalidAction.status).toBe(400)
    expect(invalidKey.status).toBe(200)
    expect(mocks.prisma.countUpOccurrence.updateMany).not.toHaveBeenCalled()
  })

  it("preserves a deferral chosen before the visibility dwell completes", async () => {
    const { POST } = await import("./route")

    const response = await POST(
      post({
        action: "create",
        events: [wire({ deferredUntil: "2026-07-16T13:00:00.000Z" })],
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.countUpOccurrence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          firstSeenAt: null,
          deferredUntil: new Date("2026-07-16T13:00:00.000Z"),
        }),
      }),
    )
  })

  it("returns a controlled storage error", async () => {
    mocks.prisma.countUpOccurrence.findMany.mockRejectedValueOnce(new Error("database unavailable"))
    const { GET } = await import("./route")

    const response = await GET(new Request("https://app.example.test/api/timer-attention"))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
  })
})

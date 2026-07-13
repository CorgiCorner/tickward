import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
  getEntitlementsTable: vi.fn(),
  getResendConfig: vi.fn(),
  getSiteOrigin: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

vi.mock("@/lib/entitlements.server", () => ({
  getEntitlementsTable: mocks.getEntitlementsTable,
}))

vi.mock("@/lib/private-config.server", () => ({
  getResendConfig: mocks.getResendConfig,
}))

vi.mock("@/lib/site-config", () => ({
  getSiteOrigin: mocks.getSiteOrigin,
}))

type ProjectRow = {
  id: string
  ownerId: string | null
  name: string
  claimedAt: Date | null
  createdAt: Date
  overLimitSince: Date | null
}

function projectRow(
  id: string,
  ownerId: string,
  claimedAt: Date | null,
  overLimitSince: Date | null = null,
  name = `Project ${id}`,
): ProjectRow {
  return {
    id,
    ownerId,
    name,
    claimedAt,
    createdAt: claimedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    overLimitSince,
  }
}

function makeTx(rows: ProjectRow[], shareDeleteCount = 0) {
  return {
    project: {
      findMany: vi.fn(async (args: { where: { ownerId: string }; select: Record<string, boolean> }) => {
        const filtered = rows.filter((r) => r.ownerId === args.where.ownerId)
        // Return only requested fields
        return filtered.map((r) => {
          const result: Record<string, unknown> = {}
          if ("id" in args.select) result.id = r.id
          if ("claimedAt" in args.select) result.claimedAt = r.claimedAt
          if ("createdAt" in args.select) result.createdAt = r.createdAt
          if ("name" in args.select) result.name = r.name
          if ("overLimitSince" in args.select) result.overLimitSince = r.overLimitSince
          return result
        })
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => ({
        count: args.where.id.in.length,
      })),
    },
    share: {
      deleteMany: vi.fn(async () => ({ count: shareDeleteCount })),
    },
  }
}

function makeGcPrisma(
  rows: ProjectRow[],
  ownerGroups: Array<{ ownerId: string; _count: { ownerId: number } }> = [],
  userEmail = "owner@example.com",
  shareDeleteCount = 0,
) {
  const tx = makeTx(rows, shareDeleteCount)
  const prisma = {
    project: {
      groupBy: vi.fn(async () => ownerGroups),
    },
    user: {
      findUnique: vi.fn(async () => ({ email: userEmail })),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  }
  return { prisma, tx }
}

describe("over-limit project cleanup", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mocks.requirePrismaClient.mockReset()
    mocks.getEntitlementsTable.mockReset()
    mocks.getEntitlementsTable.mockResolvedValue({ free: { maxProjects: 2 } })
    mocks.getResendConfig.mockReset()
    mocks.getResendConfig.mockReturnValue(null)
    mocks.getSiteOrigin.mockReset()
    mocks.getSiteOrigin.mockReturnValue("https://tickward.test")
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("is disabled by default without touching Prisma", async () => {
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    await expect(sweepOverLimitProjects()).resolves.toEqual({
      stamped: 0,
      unstamped: 0,
      deleted: 0,
      alertsSent: 0,
    })

    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it.each(["", "0", "00", "not-a-number", "-7"])("is disabled for %s retention", async (value) => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", value)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    await expect(sweepOverLimitProjects()).resolves.toEqual({
      stamped: 0,
      unstamped: 0,
      deleted: 0,
      alertsSent: 0,
    })

    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("stamps only read-only projects that have no existing stamp", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")
    const ownerId = "user_abc"

    const rows: ProjectRow[] = [
      // Oldest 2 (within limit) → editable
      projectRow("proj-a", ownerId, new Date("2026-01-01T00:00:00.000Z")),
      projectRow("proj-b", ownerId, new Date("2026-02-01T00:00:00.000Z")),
      // Third oldest → read-only, no stamp
      projectRow("proj-c", ownerId, new Date("2026-03-01T00:00:00.000Z")),
    ]
    const ownerGroups = [{ ownerId, _count: { ownerId: 3 } }]
    const { prisma, tx } = makeGcPrisma(rows, ownerGroups)
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result.stamped).toBe(1)
    expect(result.unstamped).toBe(0)
    expect(result.deleted).toBe(0)

    expect(tx.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["proj-c"] }, overLimitSince: null }),
        data: { overLimitSince: now },
      }),
    )
  })

  it("clears the stamp when a project is no longer read-only", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")
    const stamp = new Date("2026-07-01T07:00:00.000Z")
    const ownerId = "user_abc"

    const rows: ProjectRow[] = [
      // Only 1 project now — all are editable; proj-a had a stamp from before
      projectRow("proj-a", ownerId, new Date("2026-01-01T00:00:00.000Z"), stamp),
    ]
    // groupBy still returns the owner (count is used only for initial filter;
    // in this test we control the groups manually to simulate "was over limit")
    const ownerGroups = [{ ownerId, _count: { ownerId: 1 } }]
    const { prisma, tx } = makeGcPrisma(rows, ownerGroups)
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result.stamped).toBe(0)
    expect(result.unstamped).toBe(1)
    expect(result.deleted).toBe(0)

    expect(tx.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["proj-a"] } }),
        data: { overLimitSince: null },
      }),
    )
  })

  it("deletes projects past retention that are still read-only at delete time", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")
    const oldStamp = new Date("2026-05-01T00:00:00.000Z") // older than 30 days before now
    const ownerId = "user_abc"

    const rows: ProjectRow[] = [
      // Two editable projects (oldest)
      projectRow("proj-a", ownerId, new Date("2026-01-01T00:00:00.000Z")),
      projectRow("proj-b", ownerId, new Date("2026-02-01T00:00:00.000Z")),
      // Third project → read-only, stamp older than cutoff → delete
      projectRow("proj-c", ownerId, new Date("2026-03-01T00:00:00.000Z"), oldStamp),
    ]
    const ownerGroups = [{ ownerId, _count: { ownerId: 3 } }]
    const { prisma, tx } = makeGcPrisma(rows, ownerGroups)
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result.stamped).toBe(0)
    expect(result.deleted).toBe(1)

    expect(tx.share.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: { in: ["proj-c"] },
        }),
      }),
    )
    expect(tx.project.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["proj-c"] },
          ownerId,
          overLimitSince: expect.objectContaining({ lt: expect.any(Date), not: null }),
        }),
      }),
    )
  })

  it("does not delete projects with stamps within the retention window", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")
    const recentStamp = new Date("2026-07-01T07:00:00.000Z") // only 8 days ago, within 30
    const ownerId = "user_abc"

    const rows: ProjectRow[] = [
      projectRow("proj-a", ownerId, new Date("2026-01-01T00:00:00.000Z")),
      projectRow("proj-b", ownerId, new Date("2026-02-01T00:00:00.000Z")),
      projectRow("proj-c", ownerId, new Date("2026-03-01T00:00:00.000Z"), recentStamp),
    ]
    const ownerGroups = [{ ownerId, _count: { ownerId: 3 } }]
    const { prisma, tx } = makeGcPrisma(rows, ownerGroups)
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result.stamped).toBe(0)
    expect(result.deleted).toBe(0)
    expect(tx.project.deleteMany).not.toHaveBeenCalled()
  })

  it("sends an alert email exactly once on fresh stamp (null→set), not on subsequent sweeps", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")
    const ownerId = "user_abc"

    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    mocks.getResendConfig.mockReturnValue({
      apiKey: "test-key",
      from: "no-reply@tickward.test",
    })

    const rows: ProjectRow[] = [
      projectRow("proj-a", ownerId, new Date("2026-01-01T00:00:00.000Z")),
      projectRow("proj-b", ownerId, new Date("2026-02-01T00:00:00.000Z")),
      // Fresh stamp scenario: no stamp yet
      projectRow("proj-c", ownerId, new Date("2026-03-01T00:00:00.000Z"), null, "My Timer Project"),
    ]
    const ownerGroups = [{ ownerId, _count: { ownerId: 3 } }]
    const { prisma } = makeGcPrisma(rows, ownerGroups, "owner@example.com")
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result.alertsSent).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe("https://api.resend.com/emails")
    const body = JSON.parse(call[1].body as string)
    expect(body.to).toEqual(["owner@example.com"])
    expect(body.subject).toContain("My Timer Project")
    expect(body.html).toContain("self-hosting")

    vi.unstubAllGlobals()
  })

  it("does not send an alert for already-stamped read-only projects", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")
    const existingStamp = new Date("2026-07-01T07:00:00.000Z")
    const ownerId = "user_abc"

    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    mocks.getResendConfig.mockReturnValue({
      apiKey: "test-key",
      from: "no-reply@tickward.test",
    })

    const rows: ProjectRow[] = [
      projectRow("proj-a", ownerId, new Date("2026-01-01T00:00:00.000Z")),
      projectRow("proj-b", ownerId, new Date("2026-02-01T00:00:00.000Z")),
      // Already stamped → not a fresh stamp → no alert
      projectRow("proj-c", ownerId, new Date("2026-03-01T00:00:00.000Z"), existingStamp),
    ]
    const ownerGroups = [{ ownerId, _count: { ownerId: 3 } }]
    const { prisma } = makeGcPrisma(rows, ownerGroups, "owner@example.com")
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result.alertsSent).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("does not send an alert when mail provider is not configured", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")
    const ownerId = "user_abc"

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    mocks.getResendConfig.mockReturnValue(null) // not configured

    const rows: ProjectRow[] = [
      projectRow("proj-a", ownerId, new Date("2026-01-01T00:00:00.000Z")),
      projectRow("proj-b", ownerId, new Date("2026-02-01T00:00:00.000Z")),
      projectRow("proj-c", ownerId, new Date("2026-03-01T00:00:00.000Z")),
    ]
    const ownerGroups = [{ ownerId, _count: { ownerId: 3 } }]
    const { prisma } = makeGcPrisma(rows, ownerGroups)
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result.stamped).toBe(1)
    expect(result.alertsSent).toBe(0)
    // fetch should NOT have been called for email
    expect(fetchMock).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("keeps the stamp and logs on alert send failure (no retry)", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")
    const ownerId = "user_abc"

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal("fetch", fetchMock)
    mocks.getResendConfig.mockReturnValue({
      apiKey: "test-key",
      from: "no-reply@tickward.test",
    })

    const rows: ProjectRow[] = [
      projectRow("proj-a", ownerId, new Date("2026-01-01T00:00:00.000Z")),
      projectRow("proj-b", ownerId, new Date("2026-02-01T00:00:00.000Z")),
      projectRow("proj-c", ownerId, new Date("2026-03-01T00:00:00.000Z")),
    ]
    const ownerGroups = [{ ownerId, _count: { ownerId: 3 } }]
    const { prisma, tx } = makeGcPrisma(rows, ownerGroups)
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result.stamped).toBe(1)
    expect(result.alertsSent).toBe(0)
    // Stamp was still applied
    expect(tx.project.updateMany).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("returns zeros and makes no writes when no owners are over limit", async () => {
    vi.stubEnv("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-09T07:00:00.000Z")

    const { prisma, tx } = makeGcPrisma([], [])
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { sweepOverLimitProjects } = await import("./over-limit-project-gc.server")

    const result = await sweepOverLimitProjects(now)

    expect(result).toEqual({ stamped: 0, unstamped: 0, deleted: 0, alertsSent: 0 })
    expect(tx.project.updateMany).not.toHaveBeenCalled()
    expect(tx.project.deleteMany).not.toHaveBeenCalled()
  })
})

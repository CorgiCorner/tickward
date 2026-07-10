import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

type ProjectRow = {
  id: string
  ownerId: string | null
  updatedAt: Date
}

function projectRow(id: string, updatedAt: Date, ownerId: string | null = null): ProjectRow {
  return { id, ownerId, updatedAt }
}

function gcPrisma(rows: ProjectRow[] = [], shareCount = 0) {
  const tx = {
    project: {
      findMany: vi.fn(async (args: { take: number; where: { ownerId: null; updatedAt: { lt: Date } } }) =>
        rows
          .filter((row) => row.ownerId === args.where.ownerId && row.updatedAt < args.where.updatedAt.lt)
          .sort(
            (left, right) => left.updatedAt.getTime() - right.updatedAt.getTime() || left.id.localeCompare(right.id),
          )
          .slice(0, args.take)
          .map((row) => ({ id: row.id })),
      ),
      deleteMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => ({
        count: args.where.id.in.length,
      })),
    },
    share: {
      deleteMany: vi.fn(async () => ({ count: shareCount })),
    },
  }
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  }
  return { prisma, tx }
}

describe("ownerless project cleanup", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mocks.requirePrismaClient.mockReset()
    vi.spyOn(console, "info").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("is disabled by default without touching Prisma", async () => {
    const { collectOwnerlessProjects } = await import("./ownerless-project-gc.server")

    await expect(collectOwnerlessProjects()).resolves.toEqual({ deletedProjects: 0, deletedShares: 0 })

    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it.each(["", "0", "00", "not-a-number", "-7"])("is disabled for %s retention", async (value) => {
    vi.stubEnv("TICKWARD_OWNERLESS_PROJECT_RETENTION_DAYS", value)
    const { collectOwnerlessProjects } = await import("./ownerless-project-gc.server")

    await expect(collectOwnerlessProjects()).resolves.toEqual({ deletedProjects: 0, deletedShares: 0 })

    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("deletes only ownerless projects older than the retention cutoff", async () => {
    vi.stubEnv("TICKWARD_OWNERLESS_PROJECT_RETENTION_DAYS", "30")
    const now = new Date("2026-07-07T12:00:00.000Z")
    const cutoff = new Date("2026-06-07T12:00:00.000Z")
    const { prisma, tx } = gcPrisma([
      projectRow("project-old", new Date(cutoff.getTime() - 1)),
      projectRow("project-at-cutoff", cutoff),
      projectRow("project-new", new Date(cutoff.getTime() + 1)),
      projectRow("project-owned-old", new Date(cutoff.getTime() - 1), "user_123"),
    ])
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { collectOwnerlessProjects } = await import("./ownerless-project-gc.server")

    await expect(collectOwnerlessProjects(now)).resolves.toEqual({ deletedProjects: 1, deletedShares: 0 })

    expect(tx.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: null, updatedAt: { lt: cutoff } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: 100,
    })
    expect(tx.share.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: { in: ["project-old"] },
        project: { is: { ownerId: null, updatedAt: { lt: cutoff } } },
      },
    })
    expect(tx.project.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["project-old"] },
        ownerId: null,
        updatedAt: { lt: cutoff },
      },
    })
  })

  it("caps each batch at 100 projects", async () => {
    vi.stubEnv("TICKWARD_OWNERLESS_PROJECT_RETENTION_DAYS", "1")
    const now = new Date("2026-07-07T12:00:00.000Z")
    const rows = Array.from({ length: 101 }, (_, index) =>
      projectRow(`project-${index.toString().padStart(3, "0")}`, new Date("2026-07-01T12:00:00.000Z")),
    )
    const { prisma, tx } = gcPrisma(rows)
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { collectOwnerlessProjects } = await import("./ownerless-project-gc.server")

    await expect(collectOwnerlessProjects(now)).resolves.toEqual({ deletedProjects: 100, deletedShares: 0 })

    expect(tx.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }))
    expect(tx.project.deleteMany.mock.calls[0][0].where.id.in).toHaveLength(100)
  })

  it("deletes shares for the selected projects in the same transaction", async () => {
    vi.stubEnv("TICKWARD_OWNERLESS_PROJECT_RETENTION_DAYS", "7")
    const calls: string[] = []
    const { prisma, tx } = gcPrisma([projectRow("project-old", new Date("2026-06-01T12:00:00.000Z"))], 2)
    tx.share.deleteMany.mockImplementationOnce(async () => {
      calls.push("shares")
      return { count: 2 }
    })
    tx.project.deleteMany.mockImplementationOnce(async () => {
      calls.push("projects")
      return { count: 1 }
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { collectOwnerlessProjects } = await import("./ownerless-project-gc.server")

    await expect(collectOwnerlessProjects(new Date("2026-07-07T12:00:00.000Z"))).resolves.toEqual({
      deletedProjects: 1,
      deletedShares: 2,
    })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.share.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: { in: ["project-old"] },
        project: { is: { ownerId: null, updatedAt: { lt: new Date("2026-06-30T12:00:00.000Z") } } },
      },
    })
    expect(tx.project.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["project-old"] },
        ownerId: null,
        updatedAt: { lt: new Date("2026-06-30T12:00:00.000Z") },
      },
    })
    expect(calls).toEqual(["shares", "projects"])
  })

  it("scopes the share delete to projects that are still ownerless and stale", async () => {
    vi.stubEnv("TICKWARD_OWNERLESS_PROJECT_RETENTION_DAYS", "7")
    const { prisma, tx } = gcPrisma([projectRow("project-claimed-mid-gc", new Date("2026-06-01T12:00:00.000Z"))])
    // Simulate the project being claimed between the select and the deletes:
    // the relation-scoped share delete then matches no rows.
    tx.share.deleteMany.mockImplementationOnce(async (args?: { where: { project: { is: { ownerId: null } } } }) => ({
      count: args?.where.project.is.ownerId === null ? 0 : -1,
    }))
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { collectOwnerlessProjects } = await import("./ownerless-project-gc.server")

    await expect(collectOwnerlessProjects(new Date("2026-07-07T12:00:00.000Z"))).resolves.toEqual({
      deletedProjects: 1,
      deletedShares: 0,
    })

    expect(tx.share.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: { in: ["project-claimed-mid-gc"] },
        project: { is: { ownerId: null, updatedAt: { lt: new Date("2026-06-30T12:00:00.000Z") } } },
      },
    })
  })

  it("throws to roll back when a selected project is claimed before the project delete", async () => {
    vi.stubEnv("TICKWARD_OWNERLESS_PROJECT_RETENTION_DAYS", "7")
    const { prisma, tx } = gcPrisma([
      projectRow("project-old", new Date("2026-06-01T12:00:00.000Z")),
      projectRow("project-claimed-mid-gc", new Date("2026-06-02T12:00:00.000Z")),
    ])
    // Both projects are selected, but one is claimed mid-transaction so the
    // project delete only removes one row.
    tx.project.deleteMany.mockImplementationOnce(async () => ({ count: 1 }))
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { collectOwnerlessProjects } = await import("./ownerless-project-gc.server")

    await expect(collectOwnerlessProjects(new Date("2026-07-07T12:00:00.000Z"))).rejects.toThrow(
      "Ownerless project GC aborted: expected to delete 2 projects, deleted 1.",
    )
  })
})

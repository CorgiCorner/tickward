import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

function prismaMock() {
  return {
    project: {
      findFirst: vi.fn(),
    },
    projectAccessToken: {
      findFirst: vi.fn(),
    },
    share: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    timer: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  }
}

const timerData = {
  id: "timer-a",
  label: "Launch",
  targetDate: "2026-05-25T12:00:00.000Z",
  timezone: "Europe/Warsaw",
  color: "#aabbcc",
  createdAt: "2026-05-20T00:00:00.000Z",
  updatedAt: "2026-05-24T00:00:00.000Z",
}

const shareRecord = {
  timerId: "timer-a",
  sharedAt: "2026-05-24T00:00:00.000Z",
}

describe("prisma share repositories", () => {
  beforeEach(() => {
    mocks.requirePrismaClient.mockReset()
  })

  it("publishes live timer share references in Postgres", async () => {
    const { prismaShareRepository } = await import("./prisma-share-repository.server")
    const prisma = prismaMock()
    prisma.projectAccessToken.findFirst.mockResolvedValue({
      projectId: "project_123",
      project: { ownerId: "user_123" },
    })
    prisma.timer.findFirst.mockResolvedValue({ id: "timer-a" })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaShareRepository.publishTimer({
        access: { kind: "restore-key", restoreKey: "restoreKey_123" },
        shareId: "shareId_12345",
        timerId: "timer-a",
        sharedAt: "2026-05-24T00:00:00.000Z",
      }),
    ).resolves.toBe(true)

    expect(prisma.projectAccessToken.findFirst).toHaveBeenCalled()
    expect(prisma.timer.findFirst).toHaveBeenCalledWith({
      where: { id: "timer-a", projectId: "project_123" },
      select: { id: true },
    })
    expect(prisma.share.upsert).toHaveBeenCalledWith({
      where: { id: "shareId_12345" },
      update: {
        kind: "timer",
        projectId: "project_123",
        ownerId: "user_123",
        data: shareRecord,
      },
      create: {
        id: "shareId_12345",
        kind: "timer",
        projectId: "project_123",
        ownerId: "user_123",
        data: shareRecord,
      },
    })
  })

  it("emits a webhook event when publishing a new user-project share", async () => {
    const { prismaShareRepository } = await import("./prisma-share-repository.server")
    const base = prismaMock()
    const prisma = {
      ...base,
      $transaction: vi.fn(),
      share: {
        ...base.share,
        findUnique: vi.fn().mockResolvedValue(null),
      },
      webhookEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    }
    prisma.$transaction.mockImplementation(async (callback: (client: typeof prisma) => unknown | Promise<unknown>) =>
      callback(prisma),
    )
    prisma.project.findFirst.mockResolvedValue({
      id: "project_123",
      name: "Main",
      ownerId: "user_123",
    })
    prisma.timer.findFirst.mockResolvedValue({ data: timerData, id: "timer-a" })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaShareRepository.publishTimer({
        access: { kind: "user-project", projectId: "project_123", user: { id: "user_123", role: "user" } },
        shareId: "shareId_12345",
        timerId: "timer-a",
        sharedAt: "2026-05-24T00:00:00.000Z",
      }),
    ).resolves.toBe(true)

    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateId: "shareId_12345",
        aggregateType: "share",
        projectId: "project_123",
        shareId: "shareId_12345",
        timerId: "timer-a",
        type: "share.created",
        userId: "user_123",
      }),
    })
  })

  it("checks whether a live timer share reference already exists", async () => {
    const { prismaShareRepository } = await import("./prisma-share-repository.server")
    const prisma = prismaMock()
    prisma.projectAccessToken.findFirst.mockResolvedValue({
      projectId: "project_123",
      project: { ownerId: "user_123" },
    })
    prisma.share.findFirst.mockResolvedValue({ data: shareRecord })
    prisma.timer.findFirst.mockResolvedValue({ id: "timer-a" })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaShareRepository.hasPublishedTimer({
        access: { kind: "restore-key", restoreKey: "restoreKey_123" },
        shareId: "shareId_12345",
        timerId: "timer-a",
      }),
    ).resolves.toBe(true)

    expect(prisma.share.findFirst).toHaveBeenCalledWith({
      where: { id: "shareId_12345", kind: "timer", projectId: "project_123" },
      select: { data: true },
    })
    expect(prisma.timer.findFirst).toHaveBeenCalledWith({
      where: { id: "timer-a", projectId: "project_123" },
      select: { id: true },
    })
  })

  it("finds a live timer share reference by project and timer", async () => {
    const { prismaShareRepository } = await import("./prisma-share-repository.server")
    const prisma = prismaMock()
    prisma.project.findFirst.mockResolvedValue({
      id: "project_123",
      ownerId: "user_123",
    })
    prisma.timer.findFirst.mockResolvedValue({ id: "timer-a" })
    prisma.share.findMany.mockResolvedValue([
      {
        id: "shareId_other",
        data: { timerId: "timer-b", sharedAt: "2026-05-23T00:00:00.000Z" },
      },
      {
        id: "shareId_existing",
        data: shareRecord,
      },
    ])
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaShareRepository.findPublishedTimer({
        access: { kind: "user-project", projectId: "project_123", user: { id: "user_123", role: "user" } },
        timerId: "timer-a",
      }),
    ).resolves.toEqual({ shareId: "shareId_existing", ...shareRecord })

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project_123", ownerId: "user_123" },
      select: { id: true, ownerId: true },
    })
    expect(prisma.timer.findFirst).toHaveBeenCalledWith({
      where: { id: "timer-a", projectId: "project_123" },
      select: { id: true },
    })
    expect(prisma.share.findMany).toHaveBeenCalledWith({
      where: { kind: "timer", projectId: "project_123" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, data: true },
    })
  })

  it("resolves live timer share batches from Postgres", async () => {
    const { prismaShareRepository } = await import("./prisma-share-repository.server")
    const prisma = prismaMock()
    prisma.share.findMany.mockResolvedValue([{ id: "shareId_12345", projectId: "project_123", data: shareRecord }])
    prisma.timer.findMany.mockResolvedValue([{ id: "timer-a", projectId: "project_123", data: timerData }])
    mocks.requirePrismaClient.mockReturnValue(prisma)

    const results = await prismaShareRepository.resolveBatch(["shareId_12345", "shareId_67890", "bad"])

    expect(prisma.share.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["shareId_12345", "shareId_67890"] }, kind: "timer" },
      select: { id: true, data: true, projectId: true },
    })
    expect(prisma.timer.findMany).toHaveBeenCalledWith({
      where: { OR: [{ id: "timer-a", projectId: "project_123" }] },
      select: { id: true, projectId: true, data: true },
    })
    expect(results.get("shareId_12345")).toEqual({
      resolvedFrom: "live",
      timer: {
        label: "Launch",
        targetDate: "2026-05-25T12:00:00.000Z",
        timezone: "Europe/Warsaw",
        color: "#aabbcc",
        sharedAt: "2026-05-24T00:00:00.000Z",
      },
    })
    expect(results.get("shareId_67890")).toBeNull()
    expect(results.has("bad")).toBe(false)
  })
})

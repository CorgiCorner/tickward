import { beforeEach, describe, expect, it, vi } from "vitest"

import { hashRestoreKeyToken } from "@/lib/auth/restore-key-token.server"
import { makeProjectSnapshot, makeSpace, makeTimer } from "@/test/factories"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

function prismaMock() {
  const prisma = {
    projectAccessToken: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn((args) => ({ model: "projectAccessTokenDeleteMany", args })),
      update: vi.fn((args) => ({ model: "projectAccessToken", args })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    project: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn((args) => ({ model: "project", args })),
      delete: vi.fn(),
    },
    timer: {
      findMany: vi.fn(),
      deleteMany: vi.fn((args) => ({ model: "timerDeleteMany", args })),
      createMany: vi.fn((args) => ({ model: "timerCreateMany", args })),
      updateMany: vi.fn((args) => ({ model: "timerUpdateMany", args })),
    },
    space: {
      deleteMany: vi.fn((args) => ({ model: "spaceDeleteMany", args })),
      createMany: vi.fn((args) => ({ model: "spaceCreateMany", args })),
      updateMany: vi.fn((args) => ({ model: "spaceUpdateMany", args })),
    },
    share: {
      deleteMany: vi.fn((args) => ({ model: "shareDeleteMany", args })),
    },
    notificationOutboxItem: {
      deleteMany: vi.fn((args) => ({ model: "notificationOutboxItemDeleteMany", args })),
    },
    notificationDeliveryLog: {
      deleteMany: vi.fn((args) => ({ model: "notificationDeliveryLogDeleteMany", args })),
    },
    webPushSubscription: {
      deleteMany: vi.fn((args) => ({ model: "webPushSubscriptionDeleteMany", args })),
    },
    user: {
      upsert: vi.fn((args) => ({ model: "user", args })),
    },
    $transaction: vi.fn(async (input) => (typeof input === "function" ? input(prisma) : input)),
  }
  return prisma
}

function expectNoRawRestoreKey(prisma: ReturnType<typeof prismaMock>, restoreKey: string) {
  const calls = [
    ...prisma.projectAccessToken.findFirst.mock.calls,
    ...prisma.projectAccessToken.findUnique.mock.calls,
    ...prisma.projectAccessToken.deleteMany.mock.calls,
    ...prisma.projectAccessToken.update.mock.calls,
    ...prisma.projectAccessToken.updateMany.mock.calls,
    ...prisma.project.create.mock.calls,
    ...prisma.project.update.mock.calls,
    ...prisma.project.delete.mock.calls,
    ...prisma.timer.findMany.mock.calls,
    ...prisma.timer.deleteMany.mock.calls,
    ...prisma.timer.createMany.mock.calls,
    ...prisma.timer.updateMany.mock.calls,
    ...prisma.space.deleteMany.mock.calls,
    ...prisma.space.createMany.mock.calls,
    ...prisma.space.updateMany.mock.calls,
    ...prisma.share.deleteMany.mock.calls,
    ...prisma.notificationOutboxItem.deleteMany.mock.calls,
    ...prisma.notificationDeliveryLog.deleteMany.mock.calls,
    ...prisma.webPushSubscription.deleteMany.mock.calls,
    ...prisma.user.upsert.mock.calls,
    ...prisma.$transaction.mock.calls,
  ]
  expect(JSON.stringify(calls)).not.toContain(restoreKey)
}

describe("prisma project repository", () => {
  beforeEach(() => {
    mocks.requirePrismaClient.mockReset()
  })

  it("loads snapshots by hashed restore-key tokens", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    const restoreKey = "restoreKey_123"
    const project = makeProjectSnapshot()
    prisma.projectAccessToken.findFirst.mockResolvedValue({
      project: { id: "project_123", ownerId: null, snapshot: project },
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(prismaProjectRepository.loadSnapshot(restoreKey)).resolves.toEqual({
      project,
      source: "project",
    })

    expect(prisma.projectAccessToken.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: hashRestoreKeyToken(restoreKey),
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      include: { project: true },
    })
    expectNoRawRestoreKey(prisma, restoreKey)
  })

  it("creates anonymous project access tokens as hashes", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    const restoreKey = "restoreKey_123"
    const timer = makeTimer({ id: "timer-a", updatedAt: "2026-05-21T00:00:00.000Z" })
    const space = makeSpace({ id: "space-a" })
    const project = makeProjectSnapshot({ timers: [timer], spaces: [space] })
    prisma.projectAccessToken.findUnique.mockResolvedValue(null)
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(prismaProjectRepository.saveSnapshot(restoreKey, project)).resolves.toBe(true)

    expect(prisma.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        snapshot: project,
        accessTokens: {
          create: { tokenHash: hashRestoreKeyToken(restoreKey) },
        },
        timers: {
          create: [
            {
              id: "timer-a",
              data: timer,
              createdAt: new Date("2026-05-20T00:00:00.000Z"),
              updatedAt: new Date("2026-05-21T00:00:00.000Z"),
              archivedAt: null,
            },
          ],
        },
        spaces: {
          create: [
            {
              id: "space-a",
              data: space,
              createdAt: new Date("2026-05-20T00:00:00.000Z"),
              updatedAt: new Date("2026-05-20T00:00:00.000Z"),
            },
          ],
        },
      }),
    })
    expectNoRawRestoreKey(prisma, restoreKey)
  })

  it("replaces timer and space relation rows when updating existing projects", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    const project = makeProjectSnapshot({
      timers: [makeTimer({ id: "timer-a", archivedAt: "2026-05-23T00:00:00.000Z" })],
      spaces: [makeSpace({ id: "space-a" })],
    })
    prisma.projectAccessToken.findUnique.mockResolvedValue({
      projectId: "project_123",
      revokedAt: null,
      expiresAt: null,
      project: { ownerId: "user_123" },
    })
    prisma.$transaction.mockResolvedValue([])
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(prismaProjectRepository.saveSnapshot("restoreKey_123", project)).resolves.toBe(true)

    expect(prisma.$transaction).toHaveBeenCalledWith([
      { model: "project", args: expect.any(Object) },
      { model: "timerDeleteMany", args: { where: { projectId: "project_123" } } },
      { model: "spaceDeleteMany", args: { where: { projectId: "project_123" } } },
      {
        model: "timerCreateMany",
        args: {
          data: [
            expect.objectContaining({
              id: "timer-a",
              projectId: "project_123",
              ownerId: "user_123",
              archivedAt: new Date("2026-05-23T00:00:00.000Z"),
            }),
          ],
        },
      },
      {
        model: "spaceCreateMany",
        args: {
          data: [
            expect.objectContaining({
              id: "space-a",
              projectId: "project_123",
              ownerId: "user_123",
            }),
          ],
        },
      },
    ])
  })

  it("does not recreate revoked anonymous project access tokens", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    prisma.projectAccessToken.findUnique.mockResolvedValue({
      projectId: "project_123",
      revokedAt: new Date("2026-06-05T08:00:00.000Z"),
      expiresAt: null,
      project: { ownerId: "user_123" },
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(prismaProjectRepository.saveSnapshot("restoreKey_123", makeProjectSnapshot())).resolves.toBe(false)

    expect(prisma.project.create).not.toHaveBeenCalled()
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it("does not write through expired anonymous project access tokens", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    prisma.projectAccessToken.findUnique.mockResolvedValue({
      projectId: "project_123",
      revokedAt: null,
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      project: { ownerId: "user_123" },
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(prismaProjectRepository.saveSnapshot("restoreKey_123", makeProjectSnapshot())).resolves.toBe(false)

    expect(prisma.project.create).not.toHaveBeenCalled()
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it("does not clear projects through revoked restore-key tokens", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    prisma.projectAccessToken.findFirst.mockResolvedValue(null)
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await prismaProjectRepository.clear("restoreKey_123")

    expect(prisma.projectAccessToken.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: hashRestoreKeyToken("restoreKey_123"),
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: { projectId: true },
    })
    expect(prisma.project.delete).not.toHaveBeenCalled()
    expect(prisma.share.deleteMany).not.toHaveBeenCalled()
    expect(prisma.timer.deleteMany).not.toHaveBeenCalled()
    expect(prisma.space.deleteMany).not.toHaveBeenCalled()
    expect(prisma.projectAccessToken.deleteMany).not.toHaveBeenCalled()
    expect(prisma.notificationOutboxItem.deleteMany).not.toHaveBeenCalled()
    expect(prisma.notificationDeliveryLog.deleteMany).not.toHaveBeenCalled()
    expect(prisma.webPushSubscription.deleteMany).not.toHaveBeenCalled()
  })

  it("deletes the full project graph through active restore-key tokens", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    prisma.projectAccessToken.findFirst.mockResolvedValue({ projectId: "project_123" })
    prisma.timer.findMany.mockResolvedValue([{ id: "timer_123" }, { id: "timer_456" }])
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await prismaProjectRepository.clear("restoreKey_123")

    expect(prisma.projectAccessToken.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: hashRestoreKeyToken("restoreKey_123"),
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: { projectId: true },
    })
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function))
    expect(prisma.timer.findMany).toHaveBeenCalledWith({ where: { projectId: "project_123" }, select: { id: true } })
    expect(prisma.notificationOutboxItem.deleteMany).toHaveBeenCalledWith({
      where: { timerId: { in: ["timer_123", "timer_456"] } },
    })
    expect(prisma.notificationDeliveryLog.deleteMany).toHaveBeenCalledWith({
      where: { timerId: { in: ["timer_123", "timer_456"] } },
    })
    expect(prisma.webPushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { restoreKeyHash: hashRestoreKeyToken("restoreKey_123") },
    })
    expect(prisma.share.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma.timer.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma.space.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma.projectAccessToken.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: "project_123" } })
  })

  it("claims anonymous projects transactionally and revokes the hashed token", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    const restoreKey = "restoreKey_123"
    const project = makeProjectSnapshot()
    prisma.projectAccessToken.findFirst.mockResolvedValue({
      id: "token_123",
      projectId: "project_123",
      project: { snapshot: project },
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaProjectRepository.claimAnonymousProject?.({
        restoreKey,
        user: { id: "user_123", email: "ada@example.com", role: "admin" },
        claimedAt: "2026-06-05T08:00:00.000Z",
      }),
    ).resolves.toEqual({
      projectId: "project_123",
      project,
      owner: { id: "user_123", email: "ada@example.com", role: "admin" },
      claimedAt: "2026-06-05T08:00:00.000Z",
    })

    const claimedAt = new Date("2026-06-05T08:00:00.000Z")
    expect(prisma.projectAccessToken.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: hashRestoreKeyToken(restoreKey),
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      include: { project: true },
    })
    expect(prisma.projectAccessToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "token_123",
        tokenHash: hashRestoreKeyToken(restoreKey),
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: claimedAt } }],
      },
      data: { claimedAt, revokedAt: claimedAt },
    })
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { id: "user_123" },
      update: { email: "ada@example.com", role: "admin" },
      create: {
        id: "user_123",
        name: "ada@example.com",
        email: "ada@example.com",
        emailVerified: true,
        role: "admin",
      },
    })
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "project_123" },
      data: { ownerId: "user_123", claimedAt },
    })
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function))
    expectNoRawRestoreKey(prisma, restoreKey)
  })

  it("does not claim when another transaction already consumed the token", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    const project = makeProjectSnapshot()
    prisma.projectAccessToken.findFirst.mockResolvedValue({
      id: "token_123",
      projectId: "project_123",
      project: { snapshot: project },
    })
    prisma.projectAccessToken.updateMany.mockResolvedValue({ count: 0 })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaProjectRepository.claimAnonymousProject?.({
        restoreKey: "restoreKey_123",
        user: { id: "user_123" },
        claimedAt: "2026-06-05T08:00:00.000Z",
      }),
    ).resolves.toBeNull()

    expect(prisma.projectAccessToken.updateMany).toHaveBeenCalled()
    expect(prisma.user.upsert).not.toHaveBeenCalled()
    expect(prisma.project.update).not.toHaveBeenCalled()
    expect(prisma.timer.updateMany).not.toHaveBeenCalled()
    expect(prisma.space.updateMany).not.toHaveBeenCalled()
  })

  it("returns claimed project ids when claiming anonymous projects", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    const project = makeProjectSnapshot()
    prisma.projectAccessToken.findFirst.mockResolvedValue({
      id: "token_123",
      projectId: "project_123",
      project: { snapshot: project },
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    const result = await prismaProjectRepository.claimAnonymousProject?.({
      restoreKey: "restoreKey_123",
      user: { id: "user_123" },
      claimedAt: "2026-06-05T08:00:00.000Z",
    })

    expect(result?.projectId).toBe("project_123")
  })

  it("loads user projects owned by the signed-in user", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    const project = makeProjectSnapshot()
    prisma.project.findFirst.mockResolvedValue({
      id: "project_123",
      ownerId: "user_123",
      snapshot: project,
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaProjectRepository.loadUserProject?.({
        projectId: "project_123",
        user: { id: "user_123", role: "user" },
      }),
    ).resolves.toEqual({
      project,
      source: "project",
      projectId: "project_123",
      ownerId: "user_123",
    })

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project_123", ownerId: "user_123" },
    })
  })

  it("lists account projects owned by the signed-in user", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    prisma.project.findMany.mockResolvedValue([
      {
        id: "project_123",
        name: "Main",
        color: null,
        ownerId: "user_123",
        claimedAt: new Date("2026-06-06T20:32:51.016Z"),
        createdAt: new Date("2026-06-05T20:50:40.519Z"),
        updatedAt: new Date("2026-06-05T21:11:37.795Z"),
        _count: { timers: 16, spaces: 1 },
      },
    ])
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaProjectRepository.listUserProjects?.({
        user: { id: "user_123", role: "user" },
      }),
    ).resolves.toEqual([
      {
        projectId: "project_123",
        name: "Main",
        ownerId: "user_123",
        claimedAt: "2026-06-06T20:32:51.016Z",
        createdAt: "2026-06-05T20:50:40.519Z",
        updatedAt: "2026-06-05T21:11:37.795Z",
        timerCount: 16,
        spaceCount: 1,
      },
    ])

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: "user_123" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        color: true,
        ownerId: true,
        claimedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { timers: true, spaces: true } },
      },
    })
  })

  it("replaces account-backed project relation rows on save", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    const project = makeProjectSnapshot({
      timers: [makeTimer({ id: "timer-a" })],
      spaces: [makeSpace({ id: "space-a" })],
    })
    prisma.project.findFirst.mockResolvedValue({ id: "project_123", ownerId: "user_123" })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaProjectRepository.saveUserProject?.({
        projectId: "project_123",
        user: { id: "user_123" },
        project,
      }),
    ).resolves.toBe(true)

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project_123", ownerId: "user_123" },
      select: { id: true, ownerId: true },
    })
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { model: "project", args: expect.any(Object) },
      { model: "timerDeleteMany", args: { where: { projectId: "project_123" } } },
      { model: "spaceDeleteMany", args: { where: { projectId: "project_123" } } },
      {
        model: "timerCreateMany",
        args: expect.objectContaining({ data: [expect.objectContaining({ ownerId: "user_123" })] }),
      },
      {
        model: "spaceCreateMany",
        args: expect.objectContaining({ data: [expect.objectContaining({ ownerId: "user_123" })] }),
      },
    ])
  })

  it("clears user projects only when the signed-in user can access them", async () => {
    const { prismaProjectRepository } = await import("./prisma-project-repository.server")
    const prisma = prismaMock()
    prisma.project.findFirst.mockResolvedValue({ id: "project_123" })
    prisma.timer.findMany.mockResolvedValue([{ id: "timer_123" }])
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaProjectRepository.clearUserProject?.({
        projectId: "project_123",
        user: { id: "user_123" },
      }),
    ).resolves.toBe(true)

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project_123", ownerId: "user_123" },
      select: { id: true },
    })
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function))
    expect(prisma.timer.findMany).toHaveBeenCalledWith({ where: { projectId: "project_123" }, select: { id: true } })
    expect(prisma.notificationOutboxItem.deleteMany).toHaveBeenCalledWith({
      where: { timerId: { in: ["timer_123"] } },
    })
    expect(prisma.notificationDeliveryLog.deleteMany).toHaveBeenCalledWith({
      where: { timerId: { in: ["timer_123"] } },
    })
    expect(prisma.webPushSubscription.deleteMany).not.toHaveBeenCalled()
    expect(prisma.share.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma.timer.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma.space.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma.projectAccessToken.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: "project_123" } })
  })
})

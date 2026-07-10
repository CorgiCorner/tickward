import { beforeEach, describe, expect, it, vi } from "vitest"

import type { UserRef } from "@/lib/contracts"
import { tenantDb } from "@/lib/tenant-db.server"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

function modelDelegate() {
  return {
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
  }
}

function prismaClient() {
  return {
    project: modelDelegate(),
    space: modelDelegate(),
    timer: modelDelegate(),
  }
}

const user: UserRef = {
  email: "ada@example.com",
  id: "user_123",
  role: "user",
}

describe("tenantDb", () => {
  beforeEach(() => {
    mocks.requirePrismaClient.mockReset()
  })

  it("merges the caller where with the current user's ownerId", async () => {
    const prisma = prismaClient()
    mocks.requirePrismaClient.mockReturnValue(prisma)

    const db = tenantDb(user)
    await db.project.findMany({ take: 10, where: { name: "Main" } })
    await db.timer.findFirst({ where: { projectId: "project_123" } })
    await db.space.count({ where: { id: "space_123" } })

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      take: 10,
      where: { name: "Main", ownerId: "user_123" },
    })
    expect(prisma.timer.findFirst).toHaveBeenCalledWith({
      where: { ownerId: "user_123", projectId: "project_123" },
    })
    expect(prisma.space.count).toHaveBeenCalledWith({
      where: { id: "space_123", ownerId: "user_123" },
    })
  })

  it("does not let caller-provided where override ownerId", async () => {
    const prisma = prismaClient()
    mocks.requirePrismaClient.mockReturnValue(prisma)

    const db = tenantDb(user)
    await db.project.findFirst({ where: { id: "project_123", ownerId: "user_other" } })

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project_123", ownerId: "user_123" },
    })
  })

  it("adds ownerId when read args or where are omitted", async () => {
    const prisma = prismaClient()
    mocks.requirePrismaClient.mockReturnValue(prisma)

    const db = tenantDb(user)
    await db.project.findMany()
    await db.timer.count({})

    expect(prisma.project.findMany).toHaveBeenCalledWith({ where: { ownerId: "user_123" } })
    expect(prisma.timer.count).toHaveBeenCalledWith({ where: { ownerId: "user_123" } })
  })

  it("exposes unsafeGlobal as a passthrough to unscoped tenant models", async () => {
    const prisma = prismaClient()
    mocks.requirePrismaClient.mockReturnValue(prisma)

    const unsafe = tenantDb(user).unsafeGlobal()
    await unsafe.project.findMany({ where: { ownerId: "user_other" } })

    expect(unsafe.project).toBe(prisma.project)
    expect(unsafe.timer).toBe(prisma.timer)
    expect(unsafe.space).toBe(prisma.space)
    expect(prisma.project.findMany).toHaveBeenCalledWith({ where: { ownerId: "user_other" } })
  })
})

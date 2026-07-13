import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ requirePrismaClient: vi.fn() }))

vi.mock("@/lib/db/prisma.server", () => ({ requirePrismaClient: mocks.requirePrismaClient }))

describe("admin bootstrap", () => {
  beforeEach(() => {
    mocks.requirePrismaClient.mockReset()
  })

  it("detects whether an administrator already exists", async () => {
    const count = vi.fn().mockResolvedValue(1)
    mocks.requirePrismaClient.mockReturnValue({ user: { count } })
    const { hasAnyAdmin } = await import("@/lib/admin-bootstrap.server")

    await expect(hasAnyAdmin()).resolves.toBe(true)
    expect(count).toHaveBeenCalledWith({ where: { role: "admin" } })
  })

  it("allows exactly one of two concurrent claims to win", async () => {
    let winner: string | null = null
    const auditCreate = vi.fn().mockResolvedValue({})
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        $queryRaw: async (_strings: TemplateStringsArray, userId: string) => {
          await Promise.resolve()
          if (winner) return []
          winner = userId
          return [{ id: userId }]
        },
        auditLog: { create: auditCreate },
      }
      return callback(tx)
    })
    mocks.requirePrismaClient.mockReturnValue({ $transaction: transaction })
    const { claimAdminBootstrap } = await import("@/lib/admin-bootstrap.server")

    const results = await Promise.all([claimAdminBootstrap("user_1"), claimAdminBootstrap("user_2")])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" })
  })
})

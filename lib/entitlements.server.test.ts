import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getPrismaClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: (callback: () => unknown) => callback,
}))

vi.mock("@/lib/db/prisma.server", () => ({
  getPrismaClient: mocks.getPrismaClient,
}))

describe("server entitlements", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mocks.getPrismaClient.mockReset()
  })

  it("falls back to defaults when persistence is unavailable", async () => {
    mocks.getPrismaClient.mockReturnValue(null)
    const { getEntitlementsTable } = await import("@/lib/entitlements.server")

    const table = await getEntitlementsTable()
    expect(table.anonymous.maxTimers).toBe(20)
    expect(table.free.maxTimers).toBe(40)
  })

  it("merges database rows over defaults and preserves missing plans", async () => {
    mocks.getPrismaClient.mockReturnValue({
      planEntitlements: {
        findMany: vi.fn().mockResolvedValue([
          {
            plan: "anonymous",
            maxTimers: 11,
            maxTimersPerSpace: 7,
            maxProjects: 3,
            maxSpaces: 5,
            maxSnapshotTimers: 60,
          },
        ]),
      },
    })
    const { getEntitlementsTable } = await import("@/lib/entitlements.server")

    const table = await getEntitlementsTable()
    expect(table.anonymous).toEqual({
      plan: "anonymous",
      maxTimers: 11,
      maxTimersPerSpace: 7,
      maxProjects: 3,
      maxSpaces: 5,
      maxSnapshotTimers: 60,
    })
    expect(table.free.maxTimers).toBe(40)
  })

  it("clamps persisted values to the public range", async () => {
    mocks.getPrismaClient.mockReturnValue({
      planEntitlements: {
        findMany: vi.fn().mockResolvedValue([
          {
            plan: "free",
            maxTimers: 0,
            maxTimersPerSpace: -10,
            maxProjects: 1001,
            maxSpaces: 5000,
            maxSnapshotTimers: 25.9,
          },
        ]),
      },
    })
    const { getEntitlementsTable } = await import("@/lib/entitlements.server")

    await expect(getEntitlementsTable()).resolves.toMatchObject({
      free: {
        maxTimers: 1,
        maxTimersPerSpace: 1,
        maxProjects: 1000,
        maxSpaces: 1000,
        maxSnapshotTimers: 25,
      },
    })
  })
})

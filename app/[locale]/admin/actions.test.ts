import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  headers: vi.fn(),
  notFound: vi.fn(),
  requirePrismaClient: vi.fn(),
  updateTag: vi.fn(),
}))

vi.mock("next/headers", () => ({ headers: mocks.headers }))
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag }))
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }))
vi.mock("@/lib/actor.server", () => ({ getCurrentActor: mocks.getCurrentActor }))
vi.mock("@/lib/db/prisma.server", () => ({ requirePrismaClient: mocks.requirePrismaClient }))

const values = {
  maxProjects: 4,
  maxSnapshotTimers: 50,
  maxSpaces: 4,
  maxTimers: 40,
  maxTimersPerSpace: 40,
}

describe("updatePlanEntitlements", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue({
      kind: "user",
      user: { id: "admin_1", email: "admin@example.com", role: "admin" },
    })
    mocks.headers.mockReset()
    mocks.headers.mockResolvedValue(new Headers({ host: "tickward.test" }))
    mocks.notFound.mockReset()
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND")
    })
    mocks.updateTag.mockReset()
    mocks.requirePrismaClient.mockReset()
  })

  it("upserts validated limits, audits the write, and invalidates the cache", async () => {
    const upsert = vi.fn().mockResolvedValue({})
    const auditCreate = vi.fn().mockResolvedValue({})
    mocks.requirePrismaClient.mockReturnValue({
      $transaction: (callback: (tx: unknown) => unknown) =>
        callback({ auditLog: { create: auditCreate }, planEntitlements: { upsert } }),
    })
    const { updatePlanEntitlements } = await import("./actions")

    await updatePlanEntitlements("free", values)

    expect(upsert).toHaveBeenCalledWith({
      where: { plan: "free" },
      create: { plan: "free", ...values },
      update: values,
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "admin.plan_entitlements.updated",
        actorId: "admin_1",
        targetId: "free",
      }),
    })
    expect(mocks.updateTag).toHaveBeenCalledWith("entitlements")
  })

  it("rejects non-admin users before writing", async () => {
    mocks.getCurrentActor.mockResolvedValue({ kind: "user", user: { id: "user_1", role: "user" } })
    const upsert = vi.fn()
    mocks.requirePrismaClient.mockReturnValue({ $transaction: vi.fn() })
    const { updatePlanEntitlements } = await import("./actions")

    await expect(updatePlanEntitlements("free", values)).rejects.toThrow("NEXT_NOT_FOUND")
    expect(upsert).not.toHaveBeenCalled()
  })

  it("rejects values outside 1 through 1000", async () => {
    const upsert = vi.fn()
    mocks.requirePrismaClient.mockReturnValue({ $transaction: vi.fn() })
    const { updatePlanEntitlements } = await import("./actions")

    await expect(updatePlanEntitlements("free", { ...values, maxProjects: 0 })).rejects.toThrow(
      "Enter valid plan limits from 1 to 1000.",
    )
    expect(upsert).not.toHaveBeenCalled()
  })

  it("rejects snapshot timer limits below the total timer limit", async () => {
    const { updatePlanEntitlements } = await import("./actions")

    await expect(
      updatePlanEntitlements("free", { ...values, maxSnapshotTimers: values.maxTimers - 1 }),
    ).rejects.toThrow("Timers in a saved snapshot must be at least the total timer limit.")
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
    expect(mocks.updateTag).not.toHaveBeenCalled()
  })

  it("rejects per-space timer limits above the total timer limit", async () => {
    const { updatePlanEntitlements } = await import("./actions")

    await expect(
      updatePlanEntitlements("free", { ...values, maxTimersPerSpace: values.maxTimers + 1 }),
    ).rejects.toThrow("Timers per space cannot exceed the total timer limit.")
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
    expect(mocks.updateTag).not.toHaveBeenCalled()
  })
})

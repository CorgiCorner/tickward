import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Actor } from "@/lib/contracts"

const actor: Actor = { kind: "anonymous", restoreKey: "restoreKey_123" }

const mocks = vi.hoisted(() => ({
  shareRepository: {
    publishTimer: vi.fn(),
    hasPublishedTimer: vi.fn(),
    findPublishedTimer: vi.fn(),
    load: vi.fn(),
    resolve: vi.fn(),
    resolveBatch: vi.fn(),
  },
}))

vi.mock("@/lib/server-adapters.server", () => ({
  getServerAdapters: () => ({
    shareRepository: mocks.shareRepository,
  }),
}))

describe("share service", () => {
  beforeEach(() => {
    mocks.shareRepository.publishTimer.mockReset()
    mocks.shareRepository.hasPublishedTimer.mockReset()
    mocks.shareRepository.findPublishedTimer.mockReset()
    mocks.shareRepository.resolve.mockReset()
    mocks.shareRepository.resolveBatch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("creates live timer share links without storing owner tokens", async () => {
    const { createTimerShare } = await import("./share-service.server")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-24T00:00:00.000Z"))
    mocks.shareRepository.publishTimer.mockResolvedValue(true)

    const result = await createTimerShare({
      actor,
      timerId: "timer-a",
    })

    expect(result).not.toBeNull()
    if (!result) throw new Error("expected share result")
    expect(result?.shareId).toMatch(/^timer_[A-Za-z0-9_-]{43}$/)
    expect(result?.url).toBe(`/share/${result.shareId}`)
    expect(mocks.shareRepository.publishTimer).toHaveBeenCalledWith({
      access: { kind: "restore-key", restoreKey: "restoreKey_123" },
      shareId: result.shareId,
      timerId: "timer-a",
      sharedAt: "2026-05-24T00:00:00.000Z",
    })

    const again = await createTimerShare({
      actor,
      timerId: "timer-a",
    })
    expect(again?.shareId).toBe(result.shareId)
  })

  it("returns null when the repository cannot publish the live timer", async () => {
    const { createTimerShare } = await import("./share-service.server")
    mocks.shareRepository.publishTimer.mockResolvedValue(false)

    await expect(createTimerShare({ actor, timerId: "timer-a" })).resolves.toBeNull()
  })

  it("returns an existing live timer share without publishing it again", async () => {
    const { getExistingTimerShare } = await import("./share-service.server")
    mocks.shareRepository.hasPublishedTimer.mockResolvedValue(true)

    const result = await getExistingTimerShare({ actor, timerId: "timer-a" })

    expect(result).not.toBeNull()
    if (!result) throw new Error("expected share result")
    expect(result.shareId).toMatch(/^timer_[A-Za-z0-9_-]{43}$/)
    expect(result.url).toBe(`/share/${result.shareId}`)
    expect(mocks.shareRepository.hasPublishedTimer).toHaveBeenCalledWith({
      access: { kind: "restore-key", restoreKey: "restoreKey_123" },
      shareId: result.shareId,
      timerId: "timer-a",
    })
    expect(mocks.shareRepository.publishTimer).not.toHaveBeenCalled()
  })

  it("finds an existing timer share when the current stable id changed", async () => {
    const { getExistingTimerShare } = await import("./share-service.server")
    mocks.shareRepository.hasPublishedTimer.mockResolvedValue(false)
    mocks.shareRepository.findPublishedTimer.mockResolvedValue({
      shareId: "timer_existingShareId1234567890",
      timerId: "timer-a",
      sharedAt: "2026-05-24T00:00:00.000Z",
    })

    const result = await getExistingTimerShare({ actor, timerId: "timer-a" })

    expect(result).toEqual({
      shareId: "timer_existingShareId1234567890",
      url: "/share/timer_existingShareId1234567890",
    })
    expect(mocks.shareRepository.findPublishedTimer).toHaveBeenCalledWith({
      access: { kind: "restore-key", restoreKey: "restoreKey_123" },
      timerId: "timer-a",
    })
    expect(mocks.shareRepository.publishTimer).not.toHaveBeenCalled()
  })

  it("returns null when the live timer share has not been published yet", async () => {
    const { getExistingTimerShare } = await import("./share-service.server")
    mocks.shareRepository.hasPublishedTimer.mockResolvedValue(false)
    mocks.shareRepository.findPublishedTimer.mockResolvedValue(null)

    await expect(getExistingTimerShare({ actor, timerId: "timer-a" })).resolves.toBeNull()
  })

  it("passes through null when a share is not found", async () => {
    const { resolveTimerShare, resolveTimerShareBatch } = await import("./share-service.server")
    mocks.shareRepository.resolve.mockResolvedValue(null)
    mocks.shareRepository.resolveBatch.mockResolvedValue(new Map([["missing_id_123", null]]))

    await expect(resolveTimerShare("missing_id_123")).resolves.toBeNull()
    const batch = await resolveTimerShareBatch(["missing_id_123"])
    expect(batch.get("missing_id_123")).toBeNull()
  })

  it("resolves shares through the repository", async () => {
    const { resolveTimerShare } = await import("./share-service.server")
    const resolved = {
      resolvedFrom: "live" as const,
      timer: { label: "Launch", targetDate: "2026-05-25T12:00:00.000Z", timezone: "Europe/Warsaw" },
    }
    mocks.shareRepository.resolve.mockResolvedValue(resolved)

    await expect(resolveTimerShare("shareId_12345")).resolves.toBe(resolved)
    expect(mocks.shareRepository.resolve).toHaveBeenCalledWith("shareId_12345")
  })

  it("resolves share batches through the repository", async () => {
    const { resolveTimerShareBatch } = await import("./share-service.server")
    const batch = new Map()
    mocks.shareRepository.resolveBatch.mockResolvedValue(batch)

    await expect(resolveTimerShareBatch(["shareId_12345", "shareId_67890"])).resolves.toBe(batch)
    expect(mocks.shareRepository.resolveBatch).toHaveBeenCalledWith(["shareId_12345", "shareId_67890"])
  })
})

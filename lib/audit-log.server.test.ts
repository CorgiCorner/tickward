import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

describe("audit log storage", () => {
  beforeEach(() => {
    mocks.requirePrismaClient.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("records audit events without exposing caller timing to the write", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit_123" })
    mocks.requirePrismaClient.mockReturnValue({ auditLog: { create } })
    const { recordAuditEvent } = await import("@/lib/audit-log.server")

    expect(
      recordAuditEvent({
        action: "api_key.created",
        actorEmail: " ada@example.com ",
        actorId: " user_123 ",
        ip: " 203.0.113.10 ",
        metadata: { key_prefix: "tw_test", permission: "read" },
        targetId: " key_123 ",
        targetType: " api_key ",
        userAgent: " Test Browser ",
      }),
    ).toBeUndefined()

    expect(create).toHaveBeenCalledWith({
      data: {
        action: "api_key.created",
        actorEmail: "ada@example.com",
        actorId: "user_123",
        ip: "203.0.113.10",
        metadata: { key_prefix: "tw_test", permission: "read" },
        targetId: "key_123",
        targetType: "api_key",
        userAgent: "Test Browser",
      },
    })
  })

  it("never throws and logs when an audit write rejects", async () => {
    const error = new Error("write failed")
    mocks.requirePrismaClient.mockReturnValue({ auditLog: { create: vi.fn().mockRejectedValue(error) } })
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { recordAuditEvent } = await import("@/lib/audit-log.server")

    expect(() => recordAuditEvent({ action: "auth.signin.success" })).not.toThrow()

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("[tickward] audit.write", error)
    })
  })

  it("purges events older than the retention cutoff", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-07T20:00:00.000Z"))
    const deleteMany = vi.fn().mockResolvedValue({ count: 7 })
    mocks.requirePrismaClient.mockReturnValue({ auditLog: { deleteMany } })
    const { purgeOldAuditEvents } = await import("@/lib/audit-log.server")

    await expect(purgeOldAuditEvents(400)).resolves.toBe(7)

    expect(deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2025-06-02T20:00:00.000Z") } },
    })
  })

  it("returns zero and logs when purge fails", async () => {
    const error = new Error("delete failed")
    mocks.requirePrismaClient.mockReturnValue({ auditLog: { deleteMany: vi.fn().mockRejectedValue(error) } })
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { purgeOldAuditEvents } = await import("@/lib/audit-log.server")

    await expect(purgeOldAuditEvents()).resolves.toBe(0)

    expect(consoleError).toHaveBeenCalledWith("[tickward] audit.purge", error)
  })
})

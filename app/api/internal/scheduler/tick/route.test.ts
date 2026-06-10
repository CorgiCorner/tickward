import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  runWebhookSchedulerTick: vi.fn(),
  verifySchedulerSecret: vi.fn(),
}))

vi.mock("@/lib/webhooks.server", () => ({
  runWebhookSchedulerTick: mocks.runWebhookSchedulerTick,
  verifySchedulerSecret: mocks.verifySchedulerSecret,
}))

describe("/api/internal/scheduler/tick", () => {
  beforeEach(() => {
    mocks.runWebhookSchedulerTick.mockReset()
    mocks.runWebhookSchedulerTick.mockResolvedValue({
      delivered: 0,
      delivery_failed: 0,
      delivery_retried: 0,
      events_completed: 0,
      events_failed: 0,
      events_picked: 0,
    })
    mocks.verifySchedulerSecret.mockReset()
  })

  it("rejects requests without a valid scheduler secret", async () => {
    mocks.verifySchedulerSecret.mockReturnValue(false)
    const { POST } = await import("./route")

    const res = await POST(new Request("https://tickward.test/api/internal/scheduler/tick", { method: "POST" }))

    expect(res.status).toBe(401)
    expect(mocks.runWebhookSchedulerTick).not.toHaveBeenCalled()
  })

  it("runs one scheduler tick with a valid scheduler secret", async () => {
    mocks.verifySchedulerSecret.mockReturnValue(true)
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/internal/scheduler/tick", {
        headers: { authorization: "Bearer secret" },
        method: "POST",
      }),
    )

    await expect(res.json()).resolves.toMatchObject({ ok: true, events_picked: 0 })
    expect(mocks.verifySchedulerSecret).toHaveBeenCalledWith("Bearer secret")
    expect(mocks.runWebhookSchedulerTick).toHaveBeenCalledTimes(1)
  })

  it("returns an unavailable state when the scheduler tick fails", async () => {
    mocks.verifySchedulerSecret.mockReturnValue(true)
    mocks.runWebhookSchedulerTick.mockRejectedValue(new Error("storage unavailable"))
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/internal/scheduler/tick", {
        headers: { authorization: "Bearer secret" },
        method: "POST",
      }),
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
  })
})

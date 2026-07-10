import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  collectOwnerlessProjects: vi.fn(),
  sweepOverLimitProjects: vi.fn(),
  deliverDueTimerReminders: vi.fn(),
  purgeOldAuditEvents: vi.fn(),
  runWebhookSchedulerTick: vi.fn(),
  verifySchedulerSecret: vi.fn(),
}))

vi.mock("@/lib/ownerless-project-gc.server", () => ({
  collectOwnerlessProjects: mocks.collectOwnerlessProjects,
}))

vi.mock("@/lib/over-limit-project-gc.server", () => ({
  sweepOverLimitProjects: mocks.sweepOverLimitProjects,
}))

vi.mock("@/lib/audit-log.server", () => ({
  purgeOldAuditEvents: mocks.purgeOldAuditEvents,
}))

vi.mock("@/lib/timer-reminders.server", () => ({
  deliverDueTimerReminders: mocks.deliverDueTimerReminders,
}))

vi.mock("@/lib/webhooks.server", () => ({
  runWebhookSchedulerTick: mocks.runWebhookSchedulerTick,
  verifySchedulerSecret: mocks.verifySchedulerSecret,
}))

describe("/api/internal/scheduler/tick", () => {
  beforeEach(() => {
    mocks.collectOwnerlessProjects.mockReset()
    mocks.collectOwnerlessProjects.mockResolvedValue({
      deletedProjects: 0,
      deletedShares: 0,
    })
    mocks.sweepOverLimitProjects.mockReset()
    mocks.sweepOverLimitProjects.mockResolvedValue({
      stamped: 0,
      unstamped: 0,
      deleted: 0,
      alertsSent: 0,
    })
    mocks.deliverDueTimerReminders.mockReset()
    mocks.deliverDueTimerReminders.mockResolvedValue({
      delivered: 0,
      failed: 0,
      picked: 0,
      skipped: 0,
    })
    mocks.purgeOldAuditEvents.mockReset()
    mocks.purgeOldAuditEvents.mockResolvedValue(0)
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
    expect(mocks.collectOwnerlessProjects).not.toHaveBeenCalled()
    expect(mocks.sweepOverLimitProjects).not.toHaveBeenCalled()
    expect(mocks.purgeOldAuditEvents).not.toHaveBeenCalled()
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

    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      audit_events_purged: 0,
      events_picked: 0,
      over_limit_alerts_sent: 0,
      over_limit_projects_deleted: 0,
      over_limit_projects_stamped: 0,
      over_limit_projects_unstamped: 0,
      ownerless_project_shares_deleted: 0,
      ownerless_projects_deleted: 0,
      timer_reminders_delivered: 0,
      timer_reminders_failed: 0,
      timer_reminders_picked: 0,
      timer_reminders_skipped: 0,
    })
    expect(mocks.verifySchedulerSecret).toHaveBeenCalledWith("Bearer secret")
    expect(mocks.runWebhookSchedulerTick).toHaveBeenCalledTimes(1)
    expect(mocks.deliverDueTimerReminders).toHaveBeenCalledTimes(1)
    expect(mocks.collectOwnerlessProjects).toHaveBeenCalledTimes(1)
    expect(mocks.sweepOverLimitProjects).toHaveBeenCalledTimes(1)
    expect(mocks.purgeOldAuditEvents).toHaveBeenCalledTimes(1)
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

  it("returns an unavailable state when ownerless project cleanup fails", async () => {
    mocks.verifySchedulerSecret.mockReturnValue(true)
    mocks.collectOwnerlessProjects.mockRejectedValue(new Error("storage unavailable"))
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

  it("isolates over-limit project sweep failure from the main scheduler result", async () => {
    mocks.verifySchedulerSecret.mockReturnValue(true)
    mocks.sweepOverLimitProjects.mockRejectedValue(new Error("over-limit sweep failed"))
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/internal/scheduler/tick", {
        headers: { authorization: "Bearer secret" },
        method: "POST",
      }),
    )

    // Over-limit failure is not part of the 503 gate — other domains still return ok
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      over_limit_projects_stamped: 0,
      over_limit_projects_unstamped: 0,
      over_limit_projects_deleted: 0,
      over_limit_alerts_sent: 0,
    })
  })
})

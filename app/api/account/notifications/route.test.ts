import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  listInboxNotificationsForUser: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock("@/lib/inbox.server", () => ({
  listInboxNotificationsForUser: mocks.listInboxNotificationsForUser,
}))

const actor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }

describe("/api/account/notifications", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: { "ratelimit-limit": "60" } })
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.listInboxNotificationsForUser.mockReset()
    mocks.listInboxNotificationsForUser.mockResolvedValue({
      object: "list",
      items: [
        {
          id: "inbox_123",
          type: "timer.reminder",
          timer_id: "timer_123",
          project_id: "project_123",
          payload: { label: "Launch", offsetMinutes: 10 },
          read_at: null,
          created_at: "2026-07-03T12:00:00.000Z",
        },
      ],
      unread_count: 1,
      next_cursor: null,
    })
  })

  it("lists notifications for a signed-in user", async () => {
    const { GET } = await import("./route")

    const res = await GET(
      new Request("https://tickward.test/api/account/notifications?cursor=2026-07-03T12:00:00.000Z/inbox_123"),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    await expect(res.json()).resolves.toMatchObject({
      object: "list",
      items: [{ id: "inbox_123", timer_id: "timer_123" }],
      unread_count: 1,
      next_cursor: null,
    })
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("inbox", "user:user_123")
    expect(mocks.listInboxNotificationsForUser).toHaveBeenCalledWith({
      userId: "user_123",
      cursor: "2026-07-03T12:00:00.000Z/inbox_123",
    })
  })

  it("requires a signed-in user", async () => {
    const { GET } = await import("./route")
    mocks.getCurrentActor.mockRejectedValueOnce(new Error("missing session"))

    const res = await GET(new Request("https://tickward.test/api/account/notifications"))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "unauthorized" } })
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
  })

  it("rate limits inbox reads", async () => {
    const { GET } = await import("./route")
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, headers: { "retry-after": "10" } })

    const res = await GET(new Request("https://tickward.test/api/account/notifications"))

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("10")
  })

  it("returns a controlled storage error", async () => {
    const { GET } = await import("./route")
    mocks.listInboxNotificationsForUser.mockRejectedValueOnce(new Error("database unavailable"))

    const res = await GET(new Request("https://tickward.test/api/account/notifications"))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      error: { type: "storage_unavailable", message: "Notification storage is unavailable." },
    })
  })
})

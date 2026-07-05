import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  markInboxNotificationsReadForUser: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock("@/lib/inbox.server", () => ({
  markInboxNotificationsReadForUser: mocks.markInboxNotificationsReadForUser,
}))

const actor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }

describe("/api/account/notifications/read", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: { "ratelimit-limit": "60" } })
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.markInboxNotificationsReadForUser.mockReset()
    mocks.markInboxNotificationsReadForUser.mockResolvedValue(0)
  })

  it("marks selected notifications read for the signed-in user", async () => {
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/account/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids: ["inbox_123", "inbox_456"] }),
      }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    await expect(res.json()).resolves.toEqual({ unread_count: 0 })
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("inbox", "user:user_123")
    expect(mocks.markInboxNotificationsReadForUser).toHaveBeenCalledWith({
      all: false,
      ids: ["inbox_123", "inbox_456"],
      userId: "user_123",
    })
  })

  it("marks all notifications read", async () => {
    const { POST } = await import("./route")
    mocks.markInboxNotificationsReadForUser.mockResolvedValueOnce(2)

    const res = await POST(
      new Request("https://tickward.test/api/account/notifications/read", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ unread_count: 2 })
    expect(mocks.markInboxNotificationsReadForUser).toHaveBeenCalledWith({
      all: true,
      ids: [],
      userId: "user_123",
    })
  })

  it("rejects anonymous users and invalid requests", async () => {
    const { POST } = await import("./route")
    mocks.getCurrentActor.mockRejectedValueOnce(new Error("missing session"))

    const anonymous = await POST(
      new Request("https://tickward.test/api/account/notifications/read", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
    )
    expect(anonymous.status).toBe(401)

    const invalid = await POST(
      new Request("https://tickward.test/api/account/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids: [] }),
      }),
    )
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(mocks.markInboxNotificationsReadForUser).not.toHaveBeenCalled()
  })

  it("rate limits inbox writes", async () => {
    const { POST } = await import("./route")
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, headers: { "retry-after": "10" } })

    const res = await POST(
      new Request("https://tickward.test/api/account/notifications/read", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
    )

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("10")
  })
})

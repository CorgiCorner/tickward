import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createWebhookEndpointForUser: vi.fn(),
  getCurrentActor: vi.fn(),
  listWebhookEndpointsForUser: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock("@/lib/webhooks.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhooks.server")>()
  return {
    ...actual,
    createWebhookEndpointForUser: mocks.createWebhookEndpointForUser,
    listWebhookEndpointsForUser: mocks.listWebhookEndpointsForUser,
  }
})

const userActor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com", role: "user" } }
const endpoint = {
  id: "wh_123",
  object: "webhook_endpoint",
  name: "Production",
  url: "https://example.com/tickward",
  event_types: ["timer.ended"],
  status: "active",
  failure_count: 0,
  created_at: "2026-06-09T09:00:00.000Z",
  updated_at: "2026-06-09T09:00:00.000Z",
  disabled_at: null,
  last_delivered_at: null,
  last_failed_at: null,
} as const

describe("/api/account/webhooks", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.createWebhookEndpointForUser.mockReset()
    mocks.getCurrentActor.mockReset()
    mocks.listWebhookEndpointsForUser.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.listWebhookEndpointsForUser.mockResolvedValue([endpoint])
    mocks.createWebhookEndpointForUser.mockResolvedValue({ ...endpoint, signing_secret: "test_signing_secret" })
  })

  it("lists webhooks for the signed-in user", async () => {
    const { GET } = await import("./route")

    const res = await GET(new Request("https://tickward.test/api/account/webhooks"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ object: "list", data: [endpoint], has_more: false })
    expect(mocks.listWebhookEndpointsForUser).toHaveBeenCalledWith(userActor.user)
  })

  it("requires a signed-in user", async () => {
    const { GET } = await import("./route")
    mocks.getCurrentActor.mockResolvedValue({ kind: "anonymous", restoreKey: "restore_123" })

    const res = await GET(new Request("https://tickward.test/api/account/webhooks"))

    expect(res.status).toBe(401)
    expect(mocks.listWebhookEndpointsForUser).not.toHaveBeenCalled()
  })

  it("returns rate limit responses before listing webhooks", async () => {
    const { GET } = await import("./route")
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, headers: { "retry-after": "60" } })

    const res = await GET(new Request("https://tickward.test/api/account/webhooks"))

    expect(res.status).toBe(429)
    expect(mocks.listWebhookEndpointsForUser).not.toHaveBeenCalled()
  })

  it("returns an unavailable state when listing webhooks fails", async () => {
    const { GET } = await import("./route")
    mocks.listWebhookEndpointsForUser.mockRejectedValue(new Error("storage unavailable"))

    const res = await GET(new Request("https://tickward.test/api/account/webhooks"))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
  })

  it("creates a webhook endpoint after validation", async () => {
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/account/webhooks", {
        method: "POST",
        body: JSON.stringify({
          event_types: ["timer.ended"],
          name: "Production",
          url: "https://example.com/tickward",
        }),
      }),
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ id: "wh_123", signing_secret: "test_signing_secret" })
    expect(mocks.createWebhookEndpointForUser).toHaveBeenCalledWith({
      eventTypes: ["timer.ended"],
      name: "Production",
      url: "https://example.com/tickward",
      user: userActor.user,
    })
  })

  it("rejects invalid webhook payloads", async () => {
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/account/webhooks", {
        method: "POST",
        body: JSON.stringify({ name: "", url: "http://example.com" }),
      }),
    )

    expect(res.status).toBe(400)
    expect(mocks.createWebhookEndpointForUser).not.toHaveBeenCalled()
  })

  it("rejects invalid JSON payloads", async () => {
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/account/webhooks", {
        method: "POST",
        body: "{",
      }),
    )

    expect(res.status).toBe(400)
    expect(mocks.createWebhookEndpointForUser).not.toHaveBeenCalled()
  })

  it("returns webhook URL security validation errors", async () => {
    const { POST } = await import("./route")
    const { WebhookUrlSecurityError } = await import("@/lib/webhooks.server")
    mocks.createWebhookEndpointForUser.mockRejectedValue(
      new WebhookUrlSecurityError("Webhook URL cannot target a private network."),
    )

    const res = await POST(
      new Request("https://tickward.test/api/account/webhooks", {
        method: "POST",
        body: JSON.stringify({
          event_types: ["timer.ended"],
          name: "Production",
          url: "https://example.com/tickward",
        }),
      }),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: { message: "Webhook URL cannot target a private network.", type: "validation_error" },
    })
  })

  it("rejects creation past the active endpoint limit", async () => {
    const { POST } = await import("./route")
    const { WebhookEndpointLimitError } = await import("@/lib/webhooks.server")
    mocks.createWebhookEndpointForUser.mockRejectedValue(new WebhookEndpointLimitError())

    const res = await POST(
      new Request("https://tickward.test/api/account/webhooks", {
        method: "POST",
        body: JSON.stringify({
          event_types: ["timer.ended"],
          name: "Production",
          url: "https://example.com/tickward",
        }),
      }),
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "limit_exceeded" } })
  })
})

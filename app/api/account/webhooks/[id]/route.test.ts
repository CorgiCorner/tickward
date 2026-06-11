import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  removeWebhookEndpointForUser: vi.fn(),
  updateWebhookEndpointForUser: vi.fn(),
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
    removeWebhookEndpointForUser: mocks.removeWebhookEndpointForUser,
    updateWebhookEndpointForUser: mocks.updateWebhookEndpointForUser,
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

const context = { params: Promise.resolve({ id: "wh_123" }) }

describe("/api/account/webhooks/[id]", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.getCurrentActor.mockReset()
    mocks.removeWebhookEndpointForUser.mockReset()
    mocks.updateWebhookEndpointForUser.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.updateWebhookEndpointForUser.mockResolvedValue({ ...endpoint, name: "Updated" })
    mocks.removeWebhookEndpointForUser.mockResolvedValue(true)
  })

  it("updates a webhook endpoint for the signed-in user", async () => {
    const { PATCH } = await import("./route")

    const res = await PATCH(
      new Request("https://tickward.test/api/account/webhooks/wh_123", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated", status: "active" }),
      }),
      context,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: "wh_123", name: "Updated" })
    expect(mocks.updateWebhookEndpointForUser).toHaveBeenCalledWith({
      eventTypes: undefined,
      id: "wh_123",
      name: "Updated",
      status: "active",
      url: undefined,
      user: userActor.user,
    })
  })

  it("returns 404 when the webhook endpoint is missing", async () => {
    const { PATCH } = await import("./route")
    mocks.updateWebhookEndpointForUser.mockResolvedValue(null)

    const res = await PATCH(
      new Request("https://tickward.test/api/account/webhooks/wh_123", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      context,
    )

    expect(res.status).toBe(404)
  })

  it("rejects invalid update JSON payloads", async () => {
    const { PATCH } = await import("./route")

    const res = await PATCH(
      new Request("https://tickward.test/api/account/webhooks/wh_123", {
        method: "PATCH",
        body: "{",
      }),
      context,
    )

    expect(res.status).toBe(400)
    expect(mocks.updateWebhookEndpointForUser).not.toHaveBeenCalled()
  })

  it("returns webhook URL security validation errors while updating", async () => {
    const { PATCH } = await import("./route")
    const { WebhookUrlSecurityError } = await import("@/lib/webhooks.server")
    mocks.updateWebhookEndpointForUser.mockRejectedValue(
      new WebhookUrlSecurityError("Webhook URL cannot target a private network."),
    )

    const res = await PATCH(
      new Request("https://tickward.test/api/account/webhooks/wh_123", {
        method: "PATCH",
        body: JSON.stringify({ url: "https://example.com/tickward" }),
      }),
      context,
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: { message: "Webhook URL cannot target a private network.", type: "validation_error" },
    })
  })

  it("rate limits update requests", async () => {
    const { PATCH } = await import("./route")
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, headers: { "retry-after": "60" } })

    const res = await PATCH(
      new Request("https://tickward.test/api/account/webhooks/wh_123", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      context,
    )

    expect(res.status).toBe(429)
    expect(mocks.updateWebhookEndpointForUser).not.toHaveBeenCalled()
  })

  it("disables a webhook endpoint through PATCH", async () => {
    const { PATCH } = await import("./route")
    const disabledEndpoint = { ...endpoint, status: "disabled", disabled_at: "2026-06-10T09:00:00.000Z" }
    mocks.updateWebhookEndpointForUser.mockResolvedValue(disabledEndpoint)

    const res = await PATCH(
      new Request("https://tickward.test/api/account/webhooks/wh_123", {
        method: "PATCH",
        body: JSON.stringify({ status: "disabled" }),
      }),
      context,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: "wh_123", status: "disabled" })
    expect(mocks.updateWebhookEndpointForUser).toHaveBeenCalledWith({
      eventTypes: undefined,
      id: "wh_123",
      name: undefined,
      status: "disabled",
      url: undefined,
      user: userActor.user,
    })
  })

  it("updates webhook event subscriptions through PATCH", async () => {
    const { PATCH } = await import("./route")
    const updatedEndpoint = { ...endpoint, event_types: ["timer.created", "timer.ended"] }
    mocks.updateWebhookEndpointForUser.mockResolvedValue(updatedEndpoint)

    const res = await PATCH(
      new Request("https://tickward.test/api/account/webhooks/wh_123", {
        method: "PATCH",
        body: JSON.stringify({ event_types: ["timer.created", "timer.ended"] }),
      }),
      context,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: "wh_123", event_types: ["timer.created", "timer.ended"] })
    expect(mocks.updateWebhookEndpointForUser).toHaveBeenCalledWith({
      eventTypes: ["timer.created", "timer.ended"],
      id: "wh_123",
      name: undefined,
      status: undefined,
      url: undefined,
      user: userActor.user,
    })
  })

  it("removes a webhook endpoint", async () => {
    const { DELETE } = await import("./route")

    const res = await DELETE(new Request("https://tickward.test/api/account/webhooks/wh_123"), context)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true, id: "wh_123", object: "webhook_endpoint" })
    expect(mocks.removeWebhookEndpointForUser).toHaveBeenCalledWith({ id: "wh_123", user: userActor.user })
  })

  it("requires a signed-in user", async () => {
    const { DELETE } = await import("./route")
    mocks.getCurrentActor.mockResolvedValue({ kind: "anonymous", restoreKey: "restore_123" })

    const res = await DELETE(new Request("https://tickward.test/api/account/webhooks/wh_123"), context)

    expect(res.status).toBe(401)
    expect(mocks.removeWebhookEndpointForUser).not.toHaveBeenCalled()
  })

  it("returns 404 when removing a missing webhook endpoint", async () => {
    const { DELETE } = await import("./route")
    mocks.removeWebhookEndpointForUser.mockResolvedValue(false)

    const res = await DELETE(new Request("https://tickward.test/api/account/webhooks/wh_123"), context)

    expect(res.status).toBe(404)
  })

  it("returns an unavailable state when removing fails", async () => {
    const { DELETE } = await import("./route")
    mocks.removeWebhookEndpointForUser.mockRejectedValue(new Error("storage unavailable"))

    const res = await DELETE(new Request("https://tickward.test/api/account/webhooks/wh_123"), context)

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
  })
})

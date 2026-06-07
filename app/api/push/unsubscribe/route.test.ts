import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Actor } from "@/lib/contracts"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { jsonRequest } from "@/test/factories"
import { expectPublicError } from "@/test/public-error-assertions"

const actor: Actor = { kind: "anonymous", restoreKey: "restoreKey_123" }

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  getServerAdapters: vi.fn(),
  deleteSubscription: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/server-adapters.server", () => ({
  getServerAdapters: mocks.getServerAdapters,
}))

describe("POST /api/push/unsubscribe", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.getServerAdapters.mockReset()
    mocks.deleteSubscription.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.getServerAdapters.mockReturnValue({ webPushSubscriptionRepository: undefined })
  })

  it("rejects invalid JSON, restore keys, and endpoints", async () => {
    const { POST } = await import("./route")

    const badJson = await POST(
      new Request("https://tickward.test/api/push/unsubscribe", {
        method: "POST",
        body: "{bad",
      }),
    )
    expect(badJson.status).toBe(400)
    await expectPublicError(badJson, PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson")

    const badKey = await POST(jsonRequest("https://tickward.test/api/push/unsubscribe", { restoreKey: "bad" }))
    expect(badKey.status).toBe(400)
    await expectPublicError(badKey, PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey")

    const badEndpoint = await POST(
      jsonRequest("https://tickward.test/api/push/unsubscribe", {
        restoreKey: "restoreKey_123",
        endpoint: "",
      }),
    )
    expect(badEndpoint.status).toBe(400)
    await expectPublicError(badEndpoint, PUBLIC_ERROR_CODES.invalidPushEndpoint, "errors.invalidPushEndpoint")
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
  })

  it("returns 501 until a private Web Push repository is configured", async () => {
    const { POST } = await import("./route")

    const res = await POST(
      jsonRequest("https://tickward.test/api/push/unsubscribe", {
        restoreKey: "restoreKey_123",
        endpoint: "https://push.example.test/subscription/123",
      }),
    )

    expect(res.status).toBe(501)
    await expectPublicError(res, PUBLIC_ERROR_CODES.webPushNotConfigured, "errors.webPushNotConfigured")
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
  })

  it("removes a subscription through the configured repository", async () => {
    const { POST } = await import("./route")
    mocks.getServerAdapters.mockReturnValue({
      webPushSubscriptionRepository: {
        upsertSubscription: vi.fn(),
        deleteSubscription: mocks.deleteSubscription,
        listSubscriptions: vi.fn(),
      },
    })

    const res = await POST(
      jsonRequest("https://tickward.test/api/push/unsubscribe", {
        restoreKey: "restoreKey_123",
        endpoint: "https://push.example.test/subscription/123",
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
    expect(mocks.deleteSubscription).toHaveBeenCalledWith({
      actor,
      endpoint: "https://push.example.test/subscription/123",
    })
  })
})

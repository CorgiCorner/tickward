import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Actor } from "@/lib/contracts"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { jsonRequest } from "@/test/factories"
import { expectPublicError } from "@/test/public-error-assertions"

const actor: Actor = { kind: "anonymous", restoreKey: "restoreKey_123" }

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  getServerAdapters: vi.fn(),
  upsertSubscription: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/server-adapters.server", () => ({
  getServerAdapters: mocks.getServerAdapters,
}))

function validSubscription() {
  return {
    endpoint: "https://push.example.test/subscription/123",
    expirationTime: null,
    keys: {
      p256dh: "p256dh-key",
      auth: "auth-key",
    },
  }
}

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.getServerAdapters.mockReset()
    mocks.upsertSubscription.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.getServerAdapters.mockReturnValue({ webPushSubscriptionRepository: undefined })
  })

  it("rejects invalid JSON, restore keys, and subscriptions", async () => {
    const { POST } = await import("./route")

    const badJson = await POST(
      new Request("https://tickward.test/api/push/subscribe", {
        method: "POST",
        body: "{bad",
      }),
    )
    expect(badJson.status).toBe(400)
    await expectPublicError(badJson, PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson")

    const badKey = await POST(jsonRequest("https://tickward.test/api/push/subscribe", { restoreKey: "bad" }))
    expect(badKey.status).toBe(400)
    await expectPublicError(badKey, PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey")

    const badSubscription = await POST(
      jsonRequest("https://tickward.test/api/push/subscribe", {
        restoreKey: "restoreKey_123",
        subscription: { endpoint: "not-a-url" },
      }),
    )
    expect(badSubscription.status).toBe(400)
    await expectPublicError(
      badSubscription,
      PUBLIC_ERROR_CODES.invalidPushSubscription,
      "errors.invalidPushSubscription",
    )
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
  })

  it("returns 501 until a private Web Push repository is configured", async () => {
    const { POST } = await import("./route")

    const res = await POST(
      jsonRequest("https://tickward.test/api/push/subscribe", {
        restoreKey: "restoreKey_123",
        subscription: validSubscription(),
      }),
    )

    expect(res.status).toBe(501)
    await expectPublicError(res, PUBLIC_ERROR_CODES.webPushNotConfigured, "errors.webPushNotConfigured")
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
  })

  it("persists a valid subscription through the configured repository", async () => {
    const { POST } = await import("./route")
    const subscription = validSubscription()
    mocks.getServerAdapters.mockReturnValue({
      webPushSubscriptionRepository: {
        upsertSubscription: mocks.upsertSubscription,
        deleteSubscription: vi.fn(),
        listSubscriptions: vi.fn(),
      },
    })

    const res = await POST(
      jsonRequest(
        "https://tickward.test/api/push/subscribe",
        {
          restoreKey: "restoreKey_123",
          subscription,
        },
        { headers: { "user-agent": "Vitest" } },
      ),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
    expect(mocks.upsertSubscription).toHaveBeenCalledWith({
      actor,
      subscription,
      userAgent: "Vitest",
    })
  })
})

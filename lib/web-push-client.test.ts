import { describe, expect, it, vi } from "vitest"

import { subscriptionToWebPushInput, vapidPublicKeyToApplicationServerKey } from "./web-push-client"

describe("web push client helpers", () => {
  it("converts a VAPID public key to an applicationServerKey byte array", () => {
    const key = btoa("tickward-public-key").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

    expect(Array.from(vapidPublicKeyToApplicationServerKey(key))).toEqual(
      Array.from(new TextEncoder().encode("tickward-public-key")),
    )
  })

  it("normalizes browser push subscriptions for the API schema", () => {
    const subscription = {
      toJSON: vi.fn(() => ({
        endpoint: "https://push.example.test/subscription/123",
        expirationTime: 1780000000000,
        keys: {
          p256dh: "p256dh-key",
          auth: "auth-key",
        },
      })),
    } as unknown as PushSubscription

    expect(subscriptionToWebPushInput(subscription)).toEqual({
      endpoint: "https://push.example.test/subscription/123",
      expirationTime: 1780000000000,
      keys: {
        p256dh: "p256dh-key",
        auth: "auth-key",
      },
    })
  })
})

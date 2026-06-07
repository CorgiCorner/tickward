import { describe, expect, it } from "vitest"

import { resolveBrowserPushCapability } from "./web-push-subscriptions"

describe("web push capability", () => {
  it("requires notifications, service workers, and PushManager", () => {
    expect(resolveBrowserPushCapability({ notification: false, serviceWorker: true, pushManager: true })).toMatchObject(
      { supported: false, reason: "notification_missing", permission: "unsupported" },
    )

    expect(resolveBrowserPushCapability({ notification: true, serviceWorker: false, pushManager: true })).toMatchObject(
      { supported: false, reason: "service_worker_missing", permission: "default" },
    )

    expect(resolveBrowserPushCapability({ notification: true, serviceWorker: true, pushManager: false })).toMatchObject(
      { supported: false, reason: "push_manager_missing", permission: "default" },
    )
  })

  it("reports support when all browser primitives exist", () => {
    expect(
      resolveBrowserPushCapability({
        notification: true,
        serviceWorker: true,
        pushManager: true,
        permission: "granted",
      }),
    ).toEqual({
      notification: true,
      serviceWorker: true,
      pushManager: true,
      permission: "granted",
      supported: true,
    })
  })
})

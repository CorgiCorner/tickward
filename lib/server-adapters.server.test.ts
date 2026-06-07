import { describe, expect, it, vi } from "vitest"

import { prismaNotificationDeliveryTracker } from "@/lib/adapters/prisma-notification-delivery-tracker.server"
import { prismaNotificationOutboxRepository } from "@/lib/adapters/prisma-notification-outbox-repository.server"
import { prismaProjectRepository } from "@/lib/adapters/prisma-project-repository.server"
import { prismaShareRepository } from "@/lib/adapters/prisma-share-repository.server"
import { prismaWebPushSubscriptionRepository } from "@/lib/adapters/prisma-web-push-subscription-repository.server"
import { nullMailProvider } from "@/lib/mail-provider"
import { nullNotificationDeliveryProvider } from "@/lib/notification-delivery"
import { noopNotificationScheduler } from "@/lib/notification-scheduler"

vi.mock("@/lib/server-extensions.server", () => ({
  serverExtensions: {},
}))

describe("server adapters", () => {
  it("returns public defaults when no server extensions are configured", async () => {
    const { getServerAdapters } = await import("@/lib/server-adapters.server")
    const adapters = getServerAdapters()

    await expect(adapters.resolveActor({ restoreKey: "restoreKey_123" })).resolves.toEqual({
      kind: "anonymous",
      restoreKey: "restoreKey_123",
    })
    await expect(adapters.resolveActor({ restoreKey: "" })).resolves.toBeNull()
    expect(adapters.projectRepository).toBe(prismaProjectRepository)
    expect(adapters.shareRepository).toBe(prismaShareRepository)
    expect(adapters.notificationScheduler).toBe(noopNotificationScheduler)
    expect(adapters.notificationDeliveryProvider).toBe(nullNotificationDeliveryProvider)
    expect(adapters.notificationDeliveryTracker).toBe(prismaNotificationDeliveryTracker)
    expect(adapters.notificationOutboxRepository).toBe(prismaNotificationOutboxRepository)
    expect(adapters.mailProvider).toBe(nullMailProvider)
    expect(adapters.webPushSubscriptionRepository).toBe(prismaWebPushSubscriptionRepository)
  })
})

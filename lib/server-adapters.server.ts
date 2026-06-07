import "server-only"

import type { Actor } from "@/lib/contracts"
import { prismaNotificationDeliveryTracker } from "@/lib/adapters/prisma-notification-delivery-tracker.server"
import { prismaNotificationOutboxRepository } from "@/lib/adapters/prisma-notification-outbox-repository.server"
import { prismaProjectRepository } from "@/lib/adapters/prisma-project-repository.server"
import { prismaShareRepository } from "@/lib/adapters/prisma-share-repository.server"
import { prismaWebPushSubscriptionRepository } from "@/lib/adapters/prisma-web-push-subscription-repository.server"
import { nullMailProvider } from "@/lib/mail-provider"
import type { MailProvider } from "@/lib/mail-provider"
import { nullNotificationDeliveryProvider } from "@/lib/notification-delivery"
import type { NotificationDeliveryProvider } from "@/lib/notification-delivery"
import type { NotificationOutboxRepository } from "@/lib/notification-outbox.server"
import { noopNotificationScheduler } from "@/lib/notification-scheduler"
import type { NotificationScheduler } from "@/lib/notification-scheduler"
import type { NotificationDeliveryTracker } from "@/lib/notification-tracking.server"
import type { ProjectRepository, ShareRepository } from "@/lib/repositories"
import { serverExtensions } from "@/lib/server-extensions.server"
import type { ActorResolverInput } from "@/lib/server-extension-points.server"
import type { WebPushSubscriptionRepository } from "@/lib/web-push-subscriptions"

export type ResolvedServerAdapters = {
  resolveActor(input: ActorResolverInput): Promise<Actor | null>
  projectRepository: ProjectRepository
  shareRepository: ShareRepository
  notificationScheduler: NotificationScheduler
  notificationDeliveryProvider: NotificationDeliveryProvider
  notificationDeliveryTracker: NotificationDeliveryTracker
  notificationOutboxRepository: NotificationOutboxRepository
  mailProvider: MailProvider
  webPushSubscriptionRepository?: WebPushSubscriptionRepository
}

async function resolveDefaultActor(input: ActorResolverInput): Promise<Actor | null> {
  const restoreKey = input.restoreKey?.trim()
  if (!restoreKey) return null
  return { kind: "anonymous", restoreKey }
}

export function getServerAdapters(): ResolvedServerAdapters {
  const extensionActorResolver = serverExtensions.resolveActor

  return {
    async resolveActor(input) {
      const actor = await extensionActorResolver?.(input)
      return actor ?? resolveDefaultActor(input)
    },
    projectRepository: serverExtensions.projectRepository ?? prismaProjectRepository,
    shareRepository: serverExtensions.shareRepository ?? prismaShareRepository,
    notificationScheduler: serverExtensions.notificationScheduler ?? noopNotificationScheduler,
    notificationDeliveryProvider: serverExtensions.notificationDeliveryProvider ?? nullNotificationDeliveryProvider,
    notificationDeliveryTracker: serverExtensions.notificationDeliveryTracker ?? prismaNotificationDeliveryTracker,
    notificationOutboxRepository: serverExtensions.notificationOutboxRepository ?? prismaNotificationOutboxRepository,
    mailProvider: serverExtensions.mailProvider ?? nullMailProvider,
    webPushSubscriptionRepository:
      serverExtensions.webPushSubscriptionRepository ?? prismaWebPushSubscriptionRepository,
  }
}

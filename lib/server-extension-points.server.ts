import "server-only"

import type { Actor } from "@/lib/contracts"
import type { MailProvider } from "@/lib/mail-provider"
import type { NotificationDeliveryProvider } from "@/lib/notification-delivery"
import type { NotificationOutboxRepository } from "@/lib/notification-outbox.server"
import type { NotificationScheduler } from "@/lib/notification-scheduler"
import type { NotificationDeliveryTracker } from "@/lib/notification-tracking.server"
import type { ProjectRepository, ShareRepository } from "@/lib/repositories"
import type { WebPushSubscriptionRepository } from "@/lib/web-push-subscriptions"

export type ActorResolverInput = {
  restoreKey?: string | null
  request?: Request
}

export type ActorResolver = (input: ActorResolverInput) => Promise<Actor | null>

export type EntitlementsResolver = (actor: Actor | null) => Promise<unknown>

export type ServerExtensions = {
  resolveActor?: ActorResolver
  projectRepository?: ProjectRepository
  shareRepository?: ShareRepository
  notificationScheduler?: NotificationScheduler
  notificationDeliveryProvider?: NotificationDeliveryProvider
  notificationDeliveryTracker?: NotificationDeliveryTracker
  notificationOutboxRepository?: NotificationOutboxRepository
  mailProvider?: MailProvider
  webPushSubscriptionRepository?: WebPushSubscriptionRepository
}

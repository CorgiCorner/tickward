import type { Actor } from "@/lib/contracts"

export type WebPushSubscriptionKeys = {
  p256dh: string
  auth: string
}

export type WebPushSubscriptionRecord = {
  id: string
  actor: Actor
  endpoint: string
  expirationTime: number | null
  keys: WebPushSubscriptionKeys
  userAgent?: string
  createdAt: string
  updatedAt: string
}

export type WebPushSubscriptionInput = {
  endpoint: string
  expirationTime?: number | null
  keys: WebPushSubscriptionKeys
}

export interface WebPushSubscriptionRepository {
  upsertSubscription(args: { actor: Actor; subscription: WebPushSubscriptionInput; userAgent?: string }): Promise<void>
  deleteSubscription(args: { actor: Actor; endpoint: string }): Promise<void>
  listSubscriptions(actor: Actor): Promise<WebPushSubscriptionRecord[]>
  listSubscriptionsByIds(subscriptionIds: string[]): Promise<WebPushSubscriptionRecord[]>
}

export type BrowserPushCapability = {
  supported: boolean
  notification: boolean
  serviceWorker: boolean
  pushManager: boolean
  permission: NotificationPermission | "unsupported"
  reason?: "notification_missing" | "service_worker_missing" | "push_manager_missing"
}

export function resolveBrowserPushCapability(input: {
  notification: boolean
  serviceWorker: boolean
  pushManager: boolean
  permission?: NotificationPermission
}): BrowserPushCapability {
  const permission = input.notification ? (input.permission ?? "default") : "unsupported"
  if (!input.notification) {
    return { ...input, permission, supported: false, reason: "notification_missing" }
  }
  if (!input.serviceWorker) {
    return { ...input, permission, supported: false, reason: "service_worker_missing" }
  }
  if (!input.pushManager) {
    return { ...input, permission, supported: false, reason: "push_manager_missing" }
  }
  return { ...input, permission, supported: true }
}

export function getBrowserPushCapability(): BrowserPushCapability {
  const notification = globalThis.window !== undefined && "Notification" in globalThis
  const serviceWorker = globalThis.navigator !== undefined && "serviceWorker" in globalThis.navigator
  const pushManager = "PushManager" in globalThis
  const permission = notification ? Notification.permission : undefined

  return resolveBrowserPushCapability({ notification, serviceWorker, pushManager, permission })
}

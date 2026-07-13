import type { WebPushSubscriptionInput } from "@/lib/web-push-subscriptions"
import { formatMessage } from "@/lib/i18n/messages"

export function vapidPublicKeyToApplicationServerKey(publicKey: string) {
  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4)
  const base64 = (publicKey + padding).replaceAll("-", "+").replaceAll("_", "/")
  const raw = globalThis.atob(base64)
  const output = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; i += 1) {
    // atob output is latin1, so every position holds a single code unit and
    // codePointAt(i) is always defined and equal to charCodeAt(i).
    output[i] = raw.codePointAt(i) ?? 0
  }

  return output
}

export async function fetchWebPushPublicKey() {
  const response = await fetch("/api/push/public-key", { cache: "no-store" })
  if (!response.ok) return null

  const payload = (await response.json()) as { publicKey?: unknown }
  return typeof payload.publicKey === "string" ? payload.publicKey : null
}

export function subscriptionToWebPushInput(subscription: PushSubscription): WebPushSubscriptionInput {
  const json = subscription.toJSON()

  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error(formatMessage("webPush.incompleteSubscription"))
  }

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  }
}

export async function subscribeBrowserPush(args: { restoreKey: string; publicKey: string }) {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKeyToApplicationServerKey(args.publicKey),
  })

  const payload = subscriptionToWebPushInput(subscription)
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ restoreKey: args.restoreKey, subscription: payload }),
  })

  if (!response.ok) {
    await subscription.unsubscribe()
    throw new Error(formatMessage("webPush.persistFailed"))
  }

  return payload
}

export async function unsubscribeBrowserPush(args: { restoreKey: string }) {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ restoreKey: args.restoreKey, endpoint: subscription.endpoint }),
  })
  await subscription.unsubscribe()
}

import "server-only"

import type { Actor } from "@/lib/contracts"
import { hashRestoreKeyToken } from "@/lib/auth/restore-key-token.server"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type {
  WebPushSubscriptionInput,
  WebPushSubscriptionRecord,
  WebPushSubscriptionRepository,
} from "@/lib/web-push-subscriptions"

function actorStorage(actor: Actor) {
  if (actor.kind === "user") {
    return {
      userId: actor.user.id,
      restoreKeyHash: null,
    }
  }

  return {
    userId: null,
    restoreKeyHash: hashRestoreKeyToken(actor.restoreKey),
  }
}

function actorWhere(actor: Actor) {
  const storage = actorStorage(actor)
  return storage.userId ? { userId: storage.userId } : { restoreKeyHash: storage.restoreKeyHash }
}

function expirationTimeInput(subscription: WebPushSubscriptionInput) {
  if (subscription.expirationTime === undefined || subscription.expirationTime === null) return null
  return BigInt(Math.trunc(subscription.expirationTime))
}

function toSubscriptionRecord(
  actor: Actor,
  record: {
    id: string
    endpoint: string
    expirationTime: bigint | null
    p256dh: string
    auth: string
    userAgent: string | null
    createdAt: Date
    updatedAt: Date
  },
): WebPushSubscriptionRecord {
  return {
    id: record.id,
    actor,
    endpoint: record.endpoint,
    expirationTime: record.expirationTime === null ? null : Number(record.expirationTime),
    keys: {
      p256dh: record.p256dh,
      auth: record.auth,
    },
    userAgent: record.userAgent ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

export const prismaWebPushSubscriptionRepository: WebPushSubscriptionRepository = {
  async upsertSubscription(args) {
    const prisma = requirePrismaClient()

    const storage = actorStorage(args.actor)
    await prisma.webPushSubscription.upsert({
      where: { endpoint: args.subscription.endpoint },
      update: {
        ...storage,
        p256dh: args.subscription.keys.p256dh,
        auth: args.subscription.keys.auth,
        expirationTime: expirationTimeInput(args.subscription),
        userAgent: args.userAgent,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        ...storage,
        endpoint: args.subscription.endpoint,
        p256dh: args.subscription.keys.p256dh,
        auth: args.subscription.keys.auth,
        expirationTime: expirationTimeInput(args.subscription),
        userAgent: args.userAgent,
        lastSeenAt: new Date(),
      },
    })
  },

  async deleteSubscription(args) {
    const prisma = requirePrismaClient()

    await prisma.webPushSubscription.updateMany({
      where: {
        endpoint: args.endpoint,
        ...actorWhere(args.actor),
      },
      data: {
        revokedAt: new Date(),
      },
    })
  },

  async listSubscriptions(actor) {
    const prisma = requirePrismaClient()

    const records = await prisma.webPushSubscription.findMany({
      where: {
        ...actorWhere(actor),
        revokedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    })

    return records.map((record) => toSubscriptionRecord(actor, record))
  },

  async listSubscriptionsByIds(subscriptionIds) {
    const prisma = requirePrismaClient()
    if (subscriptionIds.length === 0) return []

    const records = await prisma.webPushSubscription.findMany({
      where: {
        id: { in: subscriptionIds },
        revokedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    })

    return records.map((record) => {
      const actor: Actor = record.userId
        ? { kind: "user", user: { id: record.userId } }
        : { kind: "anonymous", restoreKey: "redacted" }
      return toSubscriptionRecord(actor, record)
    })
  },
}

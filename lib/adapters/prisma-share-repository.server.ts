import "server-only"

import { hashRestoreKeyToken, type RestoreKeyTokenHash } from "@/lib/auth/restore-key-token.server"
import { jsonInput } from "@/lib/db/prisma-json.server"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { ShareRepository, TimerShareAccess } from "@/lib/repositories"
import { spaceSchema, timerSchema } from "@/lib/schemas/timer"
import type { ResolvedShare, ShareRecord } from "@/lib/share-model"
import { isValidShareId, sharedTimerFromTimer } from "@/lib/share-model"
import { emitWebhookEvent } from "@/lib/webhooks.server"

const SHARE_KIND_TIMER = "timer"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isShareRecord(value: unknown): value is ShareRecord {
  return isRecord(value) && isString(value.timerId) && isString(value.sharedAt)
}

function timerFromData(data: unknown) {
  const parsed = timerSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

function spaceFromData(data: unknown) {
  const parsed = spaceSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

function activeAccessTokenWhere(tokenHash: RestoreKeyTokenHash, now = new Date()) {
  return {
    tokenHash,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  }
}

// Owner-scoped for every role: internal share routes act on the signed-in
// user's own projects only (no implicit admin cross-tenant access).
function ownedProjectWhere(projectId: string, access: Extract<TimerShareAccess, { kind: "user-project" }>) {
  return { id: projectId, ownerId: access.user.id }
}

async function projectForShareAccess(
  prisma: ReturnType<typeof requirePrismaClient>,
  access: TimerShareAccess,
  options: { includeName?: boolean } = {},
) {
  if (access.kind === "restore-key") {
    const token = await prisma.projectAccessToken.findFirst({
      where: activeAccessTokenWhere(hashRestoreKeyToken(access.restoreKey)),
      select: { projectId: true, project: { select: { name: options.includeName, ownerId: true } } },
    })
    if (!token) return null
    return {
      id: token.projectId,
      name: options.includeName && "name" in token.project ? token.project.name : "",
      ownerId: token.project.ownerId,
    }
  }

  const project = await prisma.project.findFirst({
    where: ownedProjectWhere(access.projectId, access),
    select: { id: true, ...(options.includeName ? { name: true } : {}), ownerId: true },
  })
  return project ? { id: project.id, name: "name" in project ? project.name : "", ownerId: project.ownerId } : null
}

function shareRecord(timerId: string, sharedAt: string): ShareRecord {
  return { timerId, sharedAt }
}

async function hasPublishedTimer(args: { shareId: string; timerId: string; access: TimerShareAccess }) {
  const prisma = requirePrismaClient()
  const project = await projectForShareAccess(prisma, args.access)
  if (!project) return false

  const share = await prisma.share.findFirst({
    where: { id: args.shareId, kind: SHARE_KIND_TIMER, projectId: project.id },
    select: { data: true },
  })
  if (!isShareRecord(share?.data) || share.data.timerId !== args.timerId) return false

  const timer = await prisma.timer.findFirst({
    where: { id: args.timerId, projectId: project.id },
    select: { id: true },
  })
  return Boolean(timer)
}

async function findPublishedTimer(args: { timerId: string; access: TimerShareAccess }) {
  const prisma = requirePrismaClient()
  const project = await projectForShareAccess(prisma, args.access)
  if (!project) return null

  const timer = await prisma.timer.findFirst({
    where: { id: args.timerId, projectId: project.id },
    select: { id: true },
  })
  if (!timer) return null

  const shares = await prisma.share.findMany({
    where: { kind: SHARE_KIND_TIMER, projectId: project.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, data: true },
  })

  const share = shares.find((record) => isShareRecord(record.data) && record.data.timerId === args.timerId)
  return share && isShareRecord(share.data) ? { shareId: share.id, ...share.data } : null
}

async function findTimerForShare(args: { timerId: string; access: TimerShareAccess }) {
  const prisma = requirePrismaClient()
  const project = await projectForShareAccess(prisma, args.access)
  if (!project) return null

  const timer = await prisma.timer.findFirst({
    where: { id: args.timerId, projectId: project.id },
    select: { data: true },
  })
  if (!timer) return null

  const parsed = timerSchema.safeParse((timer as { data?: unknown }).data)
  return { url: parsed.success ? (parsed.data.url ?? null) : null }
}

export const prismaShareRepository: ShareRepository = {
  async publishTimer(args) {
    const prisma = requirePrismaClient()
    const project = await projectForShareAccess(prisma, args.access, { includeName: true })
    if (!project) return false

    const timer = await prisma.timer.findFirst({
      where: { id: args.timerId, projectId: project.id },
      select:
        typeof (prisma as { $transaction?: unknown }).$transaction === "function"
          ? { data: true, id: true }
          : { id: true },
    })
    if (!timer) return false

    const data = jsonInput(shareRecord(args.timerId, args.sharedAt))

    if (typeof (prisma as { $transaction?: unknown }).$transaction !== "function") {
      await prisma.share.upsert({
        where: { id: args.shareId },
        update: {
          kind: SHARE_KIND_TIMER,
          projectId: project.id,
          ownerId: project.ownerId,
          data,
        },
        create: {
          id: args.shareId,
          kind: SHARE_KIND_TIMER,
          projectId: project.id,
          ownerId: project.ownerId,
          data,
        },
      })
      return true
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.share.findUnique({ where: { id: args.shareId } })
      await tx.share.upsert({
        where: { id: args.shareId },
        update: {
          kind: SHARE_KIND_TIMER,
          projectId: project.id,
          ownerId: project.ownerId,
          data,
        },
        create: {
          id: args.shareId,
          kind: SHARE_KIND_TIMER,
          projectId: project.id,
          ownerId: project.ownerId,
          data,
        },
      })

      const parsedTimer = timerSchema.safeParse((timer as { data?: unknown }).data)
      if (!existing && project.ownerId && parsedTimer.success) {
        await emitWebhookEvent(tx, {
          aggregateId: args.shareId,
          aggregateType: "share",
          payload: {
            project_id: project.id,
            project_name: project.name,
            share_id: args.shareId,
            timer_id: args.timerId,
            timer_label: parsedTimer.data.label,
          },
          projectId: project.id,
          shareId: args.shareId,
          timerId: args.timerId,
          type: "share.created",
          userId: project.ownerId,
        })
      }
    })
    return true
  },

  findTimerForShare,
  hasPublishedTimer,
  findPublishedTimer,

  async load(shareId) {
    if (!isValidShareId(shareId)) return null
    const prisma = requirePrismaClient()

    const record = await prisma.share.findFirst({
      where: { id: shareId, kind: SHARE_KIND_TIMER },
      select: { data: true },
    })

    return isShareRecord(record?.data) ? record.data : null
  },

  async resolve(shareId) {
    if (!isValidShareId(shareId)) return null
    const prisma = requirePrismaClient()

    const share = await prisma.share.findFirst({
      where: { id: shareId, kind: SHARE_KIND_TIMER },
      select: { data: true, projectId: true },
    })
    if (!share?.projectId || !isShareRecord(share.data)) return null

    const timer = await prisma.timer.findFirst({
      where: { id: share.data.timerId, projectId: share.projectId },
      select: { data: true },
    })
    const parsedTimer = timerFromData(timer?.data)
    if (!parsedTimer) return null

    const space = parsedTimer.spaceId
      ? await prisma.space.findFirst({
          where: { id: parsedTimer.spaceId, projectId: share.projectId },
          select: { data: true },
        })
      : null
    const parsedSpace = spaceFromData(space?.data)

    return {
      resolvedFrom: "live",
      timer: sharedTimerFromTimer(parsedTimer, share.data.sharedAt, Date.now(), parsedSpace),
    }
  },

  async resolveBatch(shareIds) {
    const results = new Map<string, ResolvedShare | null>()
    const validIds = shareIds.filter(isValidShareId)
    if (validIds.length === 0) return results

    const prisma = requirePrismaClient()
    const records = await prisma.share.findMany({
      where: { id: { in: validIds }, kind: SHARE_KIND_TIMER },
      select: { id: true, data: true, projectId: true },
    })
    const validRecords = records.filter(
      (record): record is typeof record & { projectId: string; data: ShareRecord } =>
        Boolean(record.projectId) && isShareRecord(record.data),
    )
    const byId = new Map(validRecords.map((record) => [record.id, record]))
    const timerRows =
      validRecords.length > 0
        ? await prisma.timer.findMany({
            where: {
              OR: validRecords.map((record) => ({
                id: record.data.timerId,
                projectId: record.projectId,
              })),
            },
            select: { id: true, projectId: true, data: true },
          })
        : []
    const timersByProjectAndId = new Map(
      timerRows.map((timer) => [`${timer.projectId}:${timer.id}`, timerFromData(timer.data)]),
    )
    const spaceWhereByKey = new Map<string, { id: string; projectId: string }>()
    for (const timer of timerRows) {
      const parsedTimer = timersByProjectAndId.get(`${timer.projectId}:${timer.id}`)
      if (parsedTimer?.spaceId) {
        spaceWhereByKey.set(`${timer.projectId}:${parsedTimer.spaceId}`, {
          id: parsedTimer.spaceId,
          projectId: timer.projectId,
        })
      }
    }
    const spaceWhere = Array.from(spaceWhereByKey.values())
    const spaceRows =
      spaceWhere.length > 0
        ? await prisma.space.findMany({
            where: { OR: spaceWhere },
            select: { id: true, projectId: true, data: true },
          })
        : []
    const spacesByProjectAndId = new Map(
      spaceRows.map((space) => [`${space.projectId}:${space.id}`, spaceFromData(space.data)]),
    )
    const nowMs = Date.now()

    for (const id of validIds) {
      const record = byId.get(id)
      if (!record) {
        results.set(id, null)
        continue
      }

      const timer = timersByProjectAndId.get(`${record.projectId}:${record.data.timerId}`)
      if (!timer) {
        results.set(id, null)
        continue
      }

      const space = timer.spaceId ? spacesByProjectAndId.get(`${record.projectId}:${timer.spaceId}`) : null
      results.set(id, {
        resolvedFrom: "live",
        timer: sharedTimerFromTimer(timer, record.data.sharedAt, nowMs, space),
      })
    }

    return results
  },
}

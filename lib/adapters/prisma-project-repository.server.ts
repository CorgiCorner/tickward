import "server-only"

import type { UserRef } from "@/lib/contracts"
import { hashRestoreKeyToken, type RestoreKeyTokenHash } from "@/lib/auth/restore-key-token.server"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"
import { type ProjectSnapshotV2, isProjectSnapshot } from "@/lib/project-model"
import { newPublicId } from "@/lib/public-ids"
import type { ClaimedProject, ProjectRepository } from "@/lib/repositories"
import {
  cancelScheduledTimerReminderIntentsForTimer,
  cancelScheduledTimerReminderIntentsForTimers,
  reconcileTimerReminders,
} from "@/lib/timer-reminders.server"
import type { Space, Timer } from "@/lib/types"
import { cancelPendingTimerEndedEvents, emitWebhookEvent, scheduleTimerEndedEvent } from "@/lib/webhooks.server"

function prismaProjectFields(project: ProjectSnapshotV2) {
  return {
    name: project.name,
    color: project.color,
    snapshot: project,
    updatedAt: new Date(project.updatedAt),
  }
}

function userUpsertFields(user: UserRef) {
  const email = user.email ?? `${user.id}@users.tickward.local`

  return {
    where: { id: user.id },
    update: {
      email,
      role: user.role ?? "user",
    },
    create: {
      id: user.id,
      name: user.email ?? user.id,
      email,
      emailVerified: Boolean(user.email),
      role: user.role ?? "user",
    },
  }
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function dateFromIso(value: string, fallback: Date) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function optionalDateFromIso(value: string | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function timerCreateData(timer: Timer, fallbackDate: Date) {
  const createdAt = dateFromIso(timer.createdAt, fallbackDate)
  return {
    id: timer.id,
    data: jsonInput(timer),
    createdAt,
    updatedAt: dateFromIso(timer.updatedAt ?? timer.createdAt, createdAt),
    archivedAt: optionalDateFromIso(timer.archivedAt),
  }
}

function timerCreateManyData(projectId: string, ownerId: string | null, project: ProjectSnapshotV2) {
  const fallbackDate = dateFromIso(project.updatedAt, new Date())
  return project.timers.map((timer) => ({
    ...timerCreateData(timer, fallbackDate),
    projectId,
    ownerId,
  }))
}

function spaceCreateData(space: Space, fallbackDate: Date) {
  const createdAt = dateFromIso(space.createdAt, fallbackDate)
  return {
    id: space.id,
    data: jsonInput(space),
    createdAt,
    updatedAt: createdAt,
  }
}

function spaceCreateManyData(projectId: string, ownerId: string | null, project: ProjectSnapshotV2) {
  const fallbackDate = dateFromIso(project.updatedAt, new Date())
  return project.spaces.map((space) => ({
    ...spaceCreateData(space, fallbackDate),
    projectId,
    ownerId,
  }))
}

function activeAccessTokenWhere(tokenHash: RestoreKeyTokenHash, now = new Date()) {
  return {
    tokenHash,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  }
}

function isActiveAccessToken(token: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()) {
  return !token.revokedAt && (!token.expiresAt || token.expiresAt > now)
}

function ownedProjectWhere(projectId: string, user: UserRef) {
  return user.role === "admin" ? { id: projectId } : { id: projectId, ownerId: user.id }
}

function ownedProjectsWhere(user: UserRef) {
  return user.role === "admin" ? {} : { ownerId: user.id }
}

function timerEventPayload(project: { id: string; name: string }, timer: Timer) {
  return {
    project_id: project.id,
    project_name: project.name,
    timer_id: timer.id,
    timer_label: timer.label,
  }
}

function timerEventType(previous: Timer, next: Timer) {
  if (!previous.archivedAt && next.archivedAt) return "timer.archived" as const
  if (previous.archivedAt && !next.archivedAt) return "timer.restored" as const
  return "timer.updated" as const
}

async function emitUserProjectSnapshotEvents(
  tx: Prisma.TransactionClient,
  args: {
    next: ProjectSnapshotV2
    previous: ProjectSnapshotV2
    project: { id: string; name: string; ownerId: string | null }
  },
) {
  if (args.previous.name !== args.next.name || args.previous.color !== args.next.color) {
    await emitWebhookEvent(tx, {
      aggregateId: args.project.id,
      aggregateType: "project",
      payload: {
        project_id: args.project.id,
        project_name: args.next.name,
        previous_name: args.previous.name,
      },
      projectId: args.project.id,
      type: "project.updated",
      userId: args.project.ownerId,
    })
  }

  const previousTimers = new Map(args.previous.timers.map((timer) => [timer.id, timer]))
  const nextTimers = new Map(args.next.timers.map((timer) => [timer.id, timer]))

  for (const timer of args.next.timers) {
    const previous = previousTimers.get(timer.id)
    if (!previous) {
      await emitWebhookEvent(tx, {
        aggregateId: timer.id,
        aggregateType: "timer",
        payload: {
          ...timerEventPayload(args.project, timer),
          target_date: timer.targetDate,
          timezone: timer.timezone,
        },
        projectId: args.project.id,
        timerId: timer.id,
        type: "timer.created",
        userId: args.project.ownerId,
      })
      await scheduleTimerEndedEvent(tx, { project: args.project, timer })
      await reconcileTimerReminders(tx, { project: args.project, timer })
      continue
    }

    if (JSON.stringify(previous) === JSON.stringify(timer)) continue

    await emitWebhookEvent(tx, {
      aggregateId: timer.id,
      aggregateType: "timer",
      payload: {
        ...timerEventPayload(args.project, timer),
        target_date: timer.targetDate,
        timezone: timer.timezone,
      },
      projectId: args.project.id,
      timerId: timer.id,
      type: timerEventType(previous, timer),
      userId: args.project.ownerId,
    })
    await scheduleTimerEndedEvent(tx, { project: args.project, timer })
    await reconcileTimerReminders(tx, { project: args.project, timer })
  }

  for (const timer of args.previous.timers) {
    if (nextTimers.has(timer.id)) continue
    await cancelScheduledTimerReminderIntentsForTimer(tx, { projectId: args.project.id, timerId: timer.id })
    await cancelPendingTimerEndedEvents(tx, {
      projectId: args.project.id,
      timerId: timer.id,
      userId: args.project.ownerId,
    })
    await emitWebhookEvent(tx, {
      aggregateId: timer.id,
      aggregateType: "timer",
      payload: timerEventPayload(args.project, timer),
      projectId: args.project.id,
      timerId: timer.id,
      type: "timer.deleted",
      userId: args.project.ownerId,
    })
  }
}

async function deleteProjectGraph(
  prisma: ReturnType<typeof requirePrismaClient>,
  args: { projectId: string; restoreKeyHash?: RestoreKeyTokenHash },
) {
  await prisma.$transaction(async (tx) => {
    const project =
      typeof (tx.project as { findUnique?: unknown }).findUnique === "function"
        ? await tx.project.findUnique({
            where: { id: args.projectId },
            select: { id: true, name: true, ownerId: true },
          })
        : null
    const timerIds = (await tx.timer.findMany({ where: { projectId: args.projectId }, select: { id: true } })).map(
      (timer) => timer.id,
    )

    if (project?.ownerId) {
      await (tx as { webhookEvent?: { updateMany?: (args: unknown) => Promise<unknown> } }).webhookEvent?.updateMany?.({
        data: { cancelledAt: new Date(), status: "cancelled" },
        where: { projectId: args.projectId, status: "pending", userId: project.ownerId },
      })
      await emitWebhookEvent(tx, {
        aggregateId: args.projectId,
        aggregateType: "project",
        payload: {
          project_id: args.projectId,
          project_name: project.name,
        },
        projectId: args.projectId,
        type: "project.deleted",
        userId: project.ownerId,
      })
    }

    if (timerIds.length > 0) {
      // Scoped like the public API's delete flows: timer ids are only unique
      // per project, so bare timer-id filters could hit other projects' rows.
      await cancelScheduledTimerReminderIntentsForTimers(tx, { projectId: args.projectId, timerIds })
      await tx.notificationOutboxItem.deleteMany({
        where: { timerId: { in: timerIds }, payload: { path: ["projectId"], equals: args.projectId } },
      })
      await tx.notificationDeliveryLog.deleteMany({
        where: {
          timerId: { in: timerIds },
          OR: [
            { transactionId: { startsWith: `timer-reminder:${args.projectId}:` } },
            ...timerIds.map((id) => ({ transactionId: { startsWith: `timer-reminder:${id}:` } })),
          ],
        },
      })
    }

    if (args.restoreKeyHash) {
      await tx.webPushSubscription.deleteMany({ where: { restoreKeyHash: args.restoreKeyHash } })
    }

    await tx.share.deleteMany({ where: { projectId: args.projectId } })
    await tx.timer.deleteMany({ where: { projectId: args.projectId } })
    await tx.space.deleteMany({ where: { projectId: args.projectId } })
    await tx.projectAccessToken.deleteMany({ where: { projectId: args.projectId } })
    await tx.project.delete({ where: { id: args.projectId } })
  })
}

export const prismaProjectRepository: ProjectRepository = {
  async loadSnapshot(restoreKey) {
    const prisma = requirePrismaClient()

    const token = await prisma.projectAccessToken.findFirst({
      where: activeAccessTokenWhere(hashRestoreKeyToken(restoreKey)),
      include: { project: true },
    })

    if (!token || !isProjectSnapshot(token.project.snapshot)) return null

    return { project: token.project.snapshot, source: "project" }
  },

  async saveSnapshot(restoreKey, project) {
    const prisma = requirePrismaClient()

    const tokenHash = hashRestoreKeyToken(restoreKey)
    const existingToken = await prisma.projectAccessToken.findUnique({
      where: { tokenHash },
      select: { projectId: true, revokedAt: true, expiresAt: true, project: { select: { ownerId: true } } },
    })

    if (existingToken && !isActiveAccessToken(existingToken)) return false

    if (existingToken) {
      const ownerId = existingToken.project.ownerId
      const timerRows = timerCreateManyData(existingToken.projectId, ownerId, project)
      const spaceRows = spaceCreateManyData(existingToken.projectId, ownerId, project)

      await prisma.$transaction([
        prisma.project.update({
          where: { id: existingToken.projectId },
          data: prismaProjectFields(project),
        }),
        prisma.timer.deleteMany({ where: { projectId: existingToken.projectId } }),
        prisma.space.deleteMany({ where: { projectId: existingToken.projectId } }),
        ...(timerRows.length > 0 ? [prisma.timer.createMany({ data: timerRows })] : []),
        ...(spaceRows.length > 0 ? [prisma.space.createMany({ data: spaceRows })] : []),
      ])
      return true
    }

    const fallbackDate = dateFromIso(project.updatedAt, new Date())
    await prisma.project.create({
      data: {
        id: newPublicId("project"),
        ...prismaProjectFields(project),
        accessTokens: {
          create: { tokenHash },
        },
        ...(project.timers.length > 0
          ? { timers: { create: project.timers.map((timer) => timerCreateData(timer, fallbackDate)) } }
          : {}),
        ...(project.spaces.length > 0
          ? { spaces: { create: project.spaces.map((space) => spaceCreateData(space, fallbackDate)) } }
          : {}),
      },
    })
    return true
  },

  async clear(restoreKey) {
    const prisma = requirePrismaClient()

    const tokenHash = hashRestoreKeyToken(restoreKey)
    const token = await prisma.projectAccessToken.findFirst({
      where: activeAccessTokenWhere(tokenHash),
      select: { projectId: true },
    })
    if (!token) return

    await deleteProjectGraph(prisma, { projectId: token.projectId, restoreKeyHash: tokenHash })
  },

  async claimAnonymousProject(args): Promise<ClaimedProject | null> {
    const prisma = requirePrismaClient()

    const tokenHash = hashRestoreKeyToken(args.restoreKey)
    const token = await prisma.projectAccessToken.findFirst({
      where: activeAccessTokenWhere(tokenHash),
      include: { project: true },
    })

    if (!token || !isProjectSnapshot(token.project.snapshot)) return null
    // Capture the narrowed snapshot; the type guard does not carry into closures.
    const snapshot = token.project.snapshot

    const claimedAt = dateFromIso(args.claimedAt, new Date())
    const claimed = await prisma.$transaction(async (tx) => {
      const consumedToken = await tx.projectAccessToken.updateMany({
        where: { id: token.id, ...activeAccessTokenWhere(tokenHash, claimedAt) },
        data: {
          claimedAt,
          revokedAt: claimedAt,
        },
      })
      if (consumedToken.count !== 1) return false

      await tx.user.upsert(userUpsertFields(args.user))
      await tx.project.update({
        where: { id: token.projectId },
        data: {
          ownerId: args.user.id,
          claimedAt,
        },
      })
      await tx.timer.updateMany({
        where: { projectId: token.projectId },
        data: { ownerId: args.user.id },
      })
      await tx.space.updateMany({
        where: { projectId: token.projectId },
        data: { ownerId: args.user.id },
      })
      for (const timer of snapshot.timers) {
        await reconcileTimerReminders(tx, {
          project: { id: token.projectId, ownerId: args.user.id },
          timer,
        })
      }
      return true
    })

    if (!claimed) return null

    return {
      projectId: token.projectId,
      project: snapshot,
      owner: args.user,
      claimedAt: args.claimedAt,
    }
  },

  async listUserProjects(args) {
    const prisma = requirePrismaClient()

    const projects = await prisma.project.findMany({
      where: ownedProjectsWhere(args.user),
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        color: true,
        ownerId: true,
        claimedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { timers: true, spaces: true } },
      },
    })

    return projects.map((project) => ({
      projectId: project.id,
      name: project.name,
      color: project.color ?? undefined,
      ownerId: project.ownerId,
      claimedAt: project.claimedAt?.toISOString(),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      timerCount: project._count.timers,
      spaceCount: project._count.spaces,
    }))
  },

  async loadUserProject(args) {
    const prisma = requirePrismaClient()

    const project = await prisma.project.findFirst({
      where: ownedProjectWhere(args.projectId, args.user),
    })

    if (!project || !isProjectSnapshot(project.snapshot)) return null

    return {
      project: project.snapshot,
      source: "project",
      projectId: project.id,
      ownerId: project.ownerId,
    }
  },

  async saveUserProject(args) {
    const prisma = requirePrismaClient()

    const existing = await prisma.project.findFirst({
      where: ownedProjectWhere(args.projectId, args.user),
      select: { id: true, ownerId: true, snapshot: true },
    })
    if (!existing) return false
    const previousSnapshot = isProjectSnapshot(existing.snapshot) ? existing.snapshot : null

    const timerRows = timerCreateManyData(existing.id, existing.ownerId, args.project)
    const spaceRows = spaceCreateManyData(existing.id, existing.ownerId, args.project)

    if (!previousSnapshot) {
      await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: existing.id },
          data: prismaProjectFields(args.project),
        })
        await tx.timer.deleteMany({ where: { projectId: existing.id } })
        await tx.space.deleteMany({ where: { projectId: existing.id } })
        if (timerRows.length > 0) await tx.timer.createMany({ data: timerRows })
        if (spaceRows.length > 0) await tx.space.createMany({ data: spaceRows })
        for (const timer of args.project.timers) {
          await reconcileTimerReminders(tx, {
            project: { id: existing.id, ownerId: existing.ownerId },
            timer,
          })
        }
      })
      return true
    }

    await prisma.$transaction(async (tx) => {
      await emitUserProjectSnapshotEvents(tx, {
        next: args.project,
        previous: previousSnapshot,
        project: { id: existing.id, name: args.project.name, ownerId: existing.ownerId },
      })
      await tx.project.update({
        where: { id: existing.id },
        data: prismaProjectFields(args.project),
      })
      await tx.timer.deleteMany({ where: { projectId: existing.id } })
      await tx.space.deleteMany({ where: { projectId: existing.id } })
      if (timerRows.length > 0) await tx.timer.createMany({ data: timerRows })
      if (spaceRows.length > 0) await tx.space.createMany({ data: spaceRows })
    })

    return true
  },

  async clearUserProject(args) {
    const prisma = requirePrismaClient()

    const project = await prisma.project.findFirst({
      where: ownedProjectWhere(args.projectId, args.user),
      select: { id: true },
    })
    if (!project) return false

    await deleteProjectGraph(prisma, { projectId: project.id })
    return true
  },
}

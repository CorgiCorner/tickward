import { z } from "zod"

import {
  countUpPolicyDurationMs,
  countUpPolicySchema,
  DEFAULT_COUNT_UP_POLICY,
  normalizeCountUpPolicy,
  policyForTimer,
  timerAfterZeroSchema,
  type CountUpPolicy,
} from "@/lib/count-up-policy"
import { apiError, apiJson, isResponse } from "@/lib/api-response"
import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  readAccountRouteJson,
  requireSignedInUser,
} from "@/lib/account-api-route.server"
import { hashRestoreKeyToken } from "@/lib/auth/restore-key-token.server"
import type { UserActor } from "@/lib/contracts"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { PrismaClient } from "@/lib/generated/prisma/client"
import { COUNT_UP_DISCOVERY_WINDOW_MS } from "@/lib/stores/count-up-tracker"

export const runtime = "nodejs"

const MAX_OCCURRENCES_PER_REQUEST = 200
const MAX_DATE_MS = 8_640_000_000_000_000
const occurrenceKeySeparator = "|"

const targetAtMsSchema = z
  .string()
  .regex(/^\d{1,16}$/)
  .refine((value) => {
    const milliseconds = Number(value)
    return Number.isSafeInteger(milliseconds) && milliseconds <= MAX_DATE_MS
  }, "targetAtMs must be a valid absolute millisecond timestamp.")

const isoDateSchema = z.iso.datetime({ offset: true })

const wireOccurrenceSchema = z
  .object({
    key: z.string().min(1).optional(),
    projectId: z.string().min(1),
    projectName: z.string().optional(),
    timer: z.object({ label: z.string(), pinned: z.boolean() }).strict().optional(),
    timerId: z.string().min(1),
    targetAtMs: targetAtMsSchema,
    crossedAt: isoDateSchema,
    firstSeenAt: isoDateSchema.nullable(),
    reviewExpiresAt: isoDateSchema.nullable().optional(),
    acknowledgedAt: isoDateSchema.nullable(),
    deferredUntil: isoDateSchema.nullable(),
    policy: countUpPolicySchema,
    usesDefaultPolicy: z.boolean().optional(),
  })
  .strict()

const keysSchema = z.array(z.string().min(1)).max(MAX_OCCURRENCES_PER_REQUEST)
const projectScopeSchema = z.string().min(1).optional()

const actionSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("create"), events: z.array(wireOccurrenceSchema).max(MAX_OCCURRENCES_PER_REQUEST) })
    .strict(),
  z.object({ action: z.literal("markSeen"), keys: keysSchema, projectId: projectScopeSchema }).strict(),
  z.object({ action: z.literal("acknowledge"), keys: keysSchema, projectId: projectScopeSchema }).strict(),
  z.object({ action: z.literal("unacknowledge"), keys: keysSchema, projectId: projectScopeSchema }).strict(),
  z
    .object({
      action: z.literal("defer"),
      keys: keysSchema,
      untilMs: z.number().int().min(0).max(MAX_DATE_MS).nullable(),
      projectId: projectScopeSchema,
    })
    .strict(),
  z.object({ action: z.literal("close"), keys: keysSchema, projectId: projectScopeSchema }).strict(),
])

type CountUpPrisma = Pick<
  PrismaClient,
  "project" | "projectAccessToken" | "timer" | "countUpOccurrence" | "userPreference"
>
type CountUpOccurrenceRow = Awaited<ReturnType<CountUpPrisma["countUpOccurrence"]["findFirst"]>>
type WireOccurrenceInput = z.infer<typeof wireOccurrenceSchema>

type TimerRow = {
  id: string
  projectId: string
  archivedAt: Date | null
  createdAt?: Date
  updatedAt?: Date
  data: unknown
}

type AccessibleProject = {
  id: string
  name: string
}

function countUpStorageUnavailable(operation: string, error: unknown) {
  return accountRouteStorageUnavailable({
    error,
    logName: "countUp",
    message: "Count-up occurrence storage is unavailable.",
    operation,
  })
}

function occurrenceKey(timerId: string, targetAtMs: bigint | string) {
  return `${timerId}${occurrenceKeySeparator}${targetAtMs.toString()}`
}

function wireOccurrence(occurrence: NonNullable<CountUpOccurrenceRow>, projectName: string, timer: TimerRow) {
  const payload = timerPayload(timer)
  return {
    key: occurrenceKey(occurrence.timerId, occurrence.targetAtMs),
    projectId: occurrence.projectId,
    projectName,
    timer: {
      label: typeof payload?.label === "string" ? payload.label : "",
      pinned: payload?.pinned === true,
    },
    timerId: occurrence.timerId,
    targetAtMs: occurrence.targetAtMs.toString(),
    crossedAt: occurrence.crossedAt.toISOString(),
    firstSeenAt: occurrence.firstSeenAt?.toISOString() ?? null,
    reviewExpiresAt: occurrence.reviewExpiresAt?.toISOString() ?? null,
    acknowledgedAt: occurrence.acknowledgedAt?.toISOString() ?? null,
    deferredUntil: occurrence.deferredUntil?.toISOString() ?? null,
    policy: normalizeCountUpPolicy({ mode: occurrence.policyMode, minutes: occurrence.policyMinutes }),
    usesDefaultPolicy: occurrence.usesDefaultPolicy,
  }
}

function activeAccessTokenWhere(tokenHash: string, now = new Date()) {
  return {
    tokenHash,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  }
}

async function accessibleProjects(prisma: CountUpPrisma, actor: UserActor, now = new Date()) {
  const owned = await prisma.project.findMany({
    where: { ownerId: actor.user.id },
    select: { id: true, name: true },
  })
  const projects = new Map<string, AccessibleProject>(owned.map((project) => [project.id, project]))

  if (actor.restoreKey) {
    const token = await prisma.projectAccessToken.findFirst({
      where: activeAccessTokenWhere(hashRestoreKeyToken(actor.restoreKey), now),
      select: { project: { select: { id: true, name: true } } },
    })
    if (token) projects.set(token.project.id, token.project)
  }

  return projects
}

function timerPayload(row: TimerRow) {
  if (!row.data || typeof row.data !== "object" || Array.isArray(row.data)) return null
  return row.data as {
    archivedAt?: unknown
    label?: unknown
    pinned?: unknown
    recurrence?: { enabled?: unknown }
    targetDate?: unknown
    afterZero?: unknown
  }
}

function timerUsesDefaultPolicy(row: TimerRow) {
  const parsed = timerAfterZeroSchema.safeParse(timerPayload(row)?.afterZero ?? { mode: "use-default" })
  return !parsed.success || parsed.data.mode === "use-default"
}

function reviewExpiryFrom(firstSeenAt: Date | null, deferredUntil: Date | null, policy: CountUpPolicy) {
  if (!firstSeenAt) return null
  if (deferredUntil) return deferredUntil
  const durationMs = countUpPolicyDurationMs(policy)
  return durationMs === null ? null : new Date(firstSeenAt.getTime() + durationMs)
}

function timerMatchesOccurrence(row: TimerRow, targetAtMs: bigint, nowMs: number) {
  const payload = timerPayload(row)
  if (!payload || row.archivedAt || typeof payload.archivedAt === "string") return false
  if (payload.recurrence?.enabled === true || typeof payload.targetDate !== "string") return false

  const currentTargetAtMs = Date.parse(payload.targetDate)
  return Number.isFinite(currentTargetAtMs) && BigInt(currentTargetAtMs) === targetAtMs && currentTargetAtMs <= nowMs
}

function occurrenceIdentity(projectId: string, timerId: string) {
  return `${projectId}\u0000${timerId}`
}

async function timersForOccurrences(prisma: CountUpPrisma, occurrences: { projectId: string; timerId: string }[]) {
  if (occurrences.length === 0) return new Map<string, TimerRow>()
  const unique = new Map(
    occurrences.map((occurrence) => [occurrenceIdentity(occurrence.projectId, occurrence.timerId), occurrence]),
  )
  const rows = await prisma.timer.findMany({
    where: {
      OR: [...unique.values()].map((occurrence) => ({ projectId: occurrence.projectId, id: occurrence.timerId })),
    },
    select: { id: true, projectId: true, archivedAt: true, createdAt: true, updatedAt: true, data: true },
  })
  return new Map(rows.map((row) => [occurrenceIdentity(row.projectId, row.id), row]))
}

async function pruneInvalidOccurrences(
  prisma: CountUpPrisma,
  userId: string,
  projects: ReadonlyMap<string, AccessibleProject>,
  now = new Date(),
) {
  const occurrences = await prisma.countUpOccurrence.findMany({ where: { userId } })
  const timers = await timersForOccurrences(
    prisma,
    occurrences
      .filter((occurrence) => projects.has(occurrence.projectId))
      .map((occurrence) => ({ projectId: occurrence.projectId, timerId: occurrence.timerId })),
  )
  const invalidIds = occurrences
    .filter((occurrence) => projects.has(occurrence.projectId))
    .filter((occurrence) => {
      const timer = timers.get(occurrenceIdentity(occurrence.projectId, occurrence.timerId))
      return !timer || !timerMatchesOccurrence(timer, occurrence.targetAtMs, now.getTime())
    })
    .map((occurrence) => occurrence.id)

  if (invalidIds.length > 0) {
    await prisma.countUpOccurrence.deleteMany({
      where: { id: { in: invalidIds }, userId, projectId: { in: [...projects.keys()] } },
    })
  }
}

async function discoverMissingOccurrences(
  prisma: CountUpPrisma,
  userId: string,
  projects: ReadonlyMap<string, AccessibleProject>,
  now: Date,
) {
  const projectIds = [...projects.keys()]
  if (projectIds.length === 0) return
  const rows = await prisma.timer.findMany({
    where: { projectId: { in: projectIds }, archivedAt: null },
    select: { id: true, projectId: true, archivedAt: true, createdAt: true, updatedAt: true, data: true },
  })
  const nowMs = now.getTime()
  const eligible = rows.flatMap((row) => {
    const payload = timerPayload(row)
    if (!payload || payload.recurrence?.enabled === true || typeof payload.targetDate !== "string") return []
    const targetAtMs = Date.parse(payload.targetDate)
    if (!Number.isFinite(targetAtMs) || targetAtMs > nowMs || targetAtMs < nowMs - COUNT_UP_DISCOVERY_WINDOW_MS) {
      return []
    }
    if (
      !row.createdAt ||
      !row.updatedAt ||
      row.createdAt.getTime() > targetAtMs ||
      row.updatedAt.getTime() > targetAtMs
    ) {
      return []
    }
    return [{ row, payload, targetAtMs }]
  })
  if (eligible.length === 0) return

  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: { countUpPolicy: true, countUpPolicyMinutes: true },
  })
  const defaultPolicy = preference
    ? normalizeCountUpPolicy({ mode: preference.countUpPolicy, minutes: preference.countUpPolicyMinutes })
    : DEFAULT_COUNT_UP_POLICY
  const data = eligible.flatMap(({ row, payload, targetAtMs }) => {
    const parsedAfterZero = timerAfterZeroSchema.safeParse(payload.afterZero ?? { mode: "use-default" })
    const policy = policyForTimer(parsedAfterZero.success ? parsedAfterZero.data : undefined, defaultPolicy)
    if (policy.mode === "move-directly-to-past") return []
    return [
      {
        userId,
        projectId: row.projectId,
        timerId: row.id,
        targetAtMs: BigInt(targetAtMs),
        crossedAt: new Date(targetAtMs),
        firstSeenAt: null,
        reviewExpiresAt: null,
        acknowledgedAt: null,
        deferredUntil: null,
        policyMode: policy.mode,
        policyMinutes: policy.minutes,
        usesDefaultPolicy: timerUsesDefaultPolicy(row),
      },
    ]
  })
  if (data.length > 0) await prisma.countUpOccurrence.createMany({ data, skipDuplicates: true })
}

async function activeState(prisma: CountUpPrisma, actor: UserActor) {
  const projects = await accessibleProjects(prisma, actor)
  const projectIds = [...projects.keys()]
  if (projectIds.length === 0) return { events: [] }
  const now = new Date()
  await pruneInvalidOccurrences(prisma, actor.user.id, projects, now)
  await discoverMissingOccurrences(prisma, actor.user.id, projects, now)
  const occurrences = await prisma.countUpOccurrence.findMany({
    where: { userId: actor.user.id, projectId: { in: projectIds } },
    orderBy: [{ crossedAt: "desc" }, { id: "asc" }],
  })
  const timers = await timersForOccurrences(
    prisma,
    occurrences.map((occurrence) => ({ projectId: occurrence.projectId, timerId: occurrence.timerId })),
  )
  const expiredIds = occurrences
    .filter((occurrence) => {
      if (occurrence.acknowledgedAt) return false
      if (!occurrence.firstSeenAt) return false
      if (occurrence.deferredUntil) return occurrence.deferredUntil.getTime() <= now.getTime()
      return occurrence.reviewExpiresAt !== null && occurrence.reviewExpiresAt.getTime() <= now.getTime()
    })
    .map((occurrence) => occurrence.id)
  if (expiredIds.length > 0) {
    await prisma.countUpOccurrence.updateMany({
      where: {
        id: { in: expiredIds },
        userId: actor.user.id,
        projectId: { in: projectIds },
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: now },
    })
  }
  const expired = new Set(expiredIds)
  return {
    events: occurrences.flatMap((occurrence) => {
      const timer = timers.get(occurrenceIdentity(occurrence.projectId, occurrence.timerId))
      if (!timer) return []
      return [
        wireOccurrence(
          expired.has(occurrence.id) ? { ...occurrence, acknowledgedAt: now } : occurrence,
          projects.get(occurrence.projectId)!.name,
          timer,
        ),
      ]
    }),
  }
}

function parseOccurrenceKey(key: string) {
  const separatorAt = key.lastIndexOf(occurrenceKeySeparator)
  if (separatorAt <= 0) return null
  const timerId = key.slice(0, separatorAt)
  const parsedTargetAtMs = targetAtMsSchema.safeParse(key.slice(separatorAt + 1))
  if (!parsedTargetAtMs.success) return null
  return { timerId, targetAtMs: BigInt(parsedTargetAtMs.data) }
}

function occurrenceIdentityWhere(keys: string[]) {
  return keys.map(parseOccurrenceKey).filter((identity): identity is NonNullable<typeof identity> => identity !== null)
}

function dateFromWire(value: string | null) {
  return value === null ? null : new Date(value)
}

function latestDate(left: Date | null, right: Date | null) {
  if (!left) return right
  if (!right) return left
  return left >= right ? left : right
}

async function createOccurrences(prisma: CountUpPrisma, actor: UserActor, occurrences: WireOccurrenceInput[]) {
  const projects = await accessibleProjects(prisma, actor)
  const accessibleOccurrences = occurrences.filter((occurrence) => projects.has(occurrence.projectId))
  const timers = await timersForOccurrences(
    prisma,
    accessibleOccurrences.map((occurrence) => ({ projectId: occurrence.projectId, timerId: occurrence.timerId })),
  )
  const nowMs = Date.now()

  for (const occurrence of accessibleOccurrences) {
    const targetAtMs = BigInt(occurrence.targetAtMs)
    const timer = timers.get(occurrenceIdentity(occurrence.projectId, occurrence.timerId))
    if (!timer || !timerMatchesOccurrence(timer, targetAtMs, nowMs)) continue

    const firstSeenAt = dateFromWire(occurrence.firstSeenAt)
    const requestedReviewExpiresAt = dateFromWire(occurrence.reviewExpiresAt ?? null)
    const acknowledgedAt = dateFromWire(occurrence.acknowledgedAt)
    const deferredUntil = dateFromWire(occurrence.deferredUntil)
    const policy = normalizeCountUpPolicy(occurrence.policy)
    const reviewExpiresAt = requestedReviewExpiresAt ?? reviewExpiryFrom(firstSeenAt, deferredUntil, policy)
    if (policy.mode === "move-directly-to-past") continue
    const identity = { userId: actor.user.id, projectId: occurrence.projectId, timerId: occurrence.timerId, targetAtMs }
    const existing = await prisma.countUpOccurrence.findFirst({ where: identity })

    await prisma.countUpOccurrence.upsert({
      where: { userId_projectId_timerId_targetAtMs: identity },
      create: {
        userId: actor.user.id,
        projectId: occurrence.projectId,
        timerId: occurrence.timerId,
        targetAtMs,
        crossedAt: new Date(Number(targetAtMs)),
        firstSeenAt,
        reviewExpiresAt,
        acknowledgedAt,
        deferredUntil,
        policyMode: policy.mode,
        policyMinutes: policy.minutes,
        usesDefaultPolicy: timerUsesDefaultPolicy(timer),
      },
      update: {
        ...(firstSeenAt && !existing?.firstSeenAt ? { firstSeenAt, reviewExpiresAt } : {}),
        ...(acknowledgedAt ? { acknowledgedAt: latestDate(existing?.acknowledgedAt ?? null, acknowledgedAt) } : {}),
        ...(deferredUntil ? { deferredUntil } : {}),
      },
    })
  }
}

async function mutateOccurrences(
  prisma: CountUpPrisma,
  actor: UserActor,
  action: Exclude<z.infer<typeof actionSchema>, { action: "create" }>,
) {
  const identities = occurrenceIdentityWhere(action.keys)
  if (identities.length === 0) return
  const projects = await accessibleProjects(prisma, actor)
  const projectIds = [...projects.keys()]
  if (projectIds.length === 0) return
  if (action.projectId && !projects.has(action.projectId)) return
  const where = {
    userId: actor.user.id,
    projectId: action.projectId ?? { in: projectIds },
    OR: identities,
  }
  const now = new Date()

  if (action.action === "markSeen") {
    const occurrences = await prisma.countUpOccurrence.findMany({ where: { ...where, firstSeenAt: null } })
    await Promise.all(
      occurrences.map((occurrence) => {
        const policy = normalizeCountUpPolicy({ mode: occurrence.policyMode, minutes: occurrence.policyMinutes })
        return prisma.countUpOccurrence.updateMany({
          where: { id: occurrence.id, firstSeenAt: null },
          data: { firstSeenAt: now, reviewExpiresAt: reviewExpiryFrom(now, null, policy) },
        })
      }),
    )
  } else if (action.action === "acknowledge") {
    await prisma.countUpOccurrence.updateMany({ where, data: { acknowledgedAt: now } })
  } else if (action.action === "unacknowledge") {
    const occurrences = await prisma.countUpOccurrence.findMany({ where })
    await Promise.all(
      occurrences.map((occurrence) => {
        const policy = normalizeCountUpPolicy({ mode: occurrence.policyMode, minutes: occurrence.policyMinutes })
        return prisma.countUpOccurrence.updateMany({
          where: { id: occurrence.id },
          data: {
            firstSeenAt: occurrence.firstSeenAt ?? now,
            acknowledgedAt: null,
            deferredUntil: null,
            reviewExpiresAt: reviewExpiryFrom(now, null, policy),
          },
        })
      }),
    )
  } else if (action.action === "defer") {
    await prisma.countUpOccurrence.updateMany({
      where,
      data: {
        deferredUntil: action.untilMs === null ? null : new Date(action.untilMs),
        ...(action.untilMs === null
          ? { policyMode: "until-i-move-it", policyMinutes: null, reviewExpiresAt: null }
          : {}),
      },
    })
  } else {
    await prisma.countUpOccurrence.deleteMany({ where })
  }
}

export async function GET(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to read count-up occurrences.")
  if (isResponse(actor)) return actor

  try {
    return apiJson(await activeState(requirePrismaClient(), actor), {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    return countUpStorageUnavailable("list", error)
  }
}

export async function POST(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to update count-up occurrences.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "write", key: `count-up:${actor.user.id}` })
  if (rateLimit) return rateLimit

  const body = await readAccountRouteJson(req)
  if (isResponse(body)) return body
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "We found an error with one or more fields in the request.", {
      details: parsed.error.issues.map((issue) => ({ message: issue.message, path: issue.path })),
      status: 400,
    })
  }

  try {
    const prisma = requirePrismaClient()
    if (parsed.data.action === "create") {
      await createOccurrences(prisma, actor, parsed.data.events)
    } else {
      await mutateOccurrences(prisma, actor, parsed.data)
    }
    return apiJson(await activeState(prisma, actor), {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    return countUpStorageUnavailable("update", error)
  }
}

import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import { z } from "zod"

import type { UserRef } from "@/lib/contracts"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"
import { optionalServerEnv, type ServerEnvVar } from "@/lib/env.server"
import { getServerAdapters } from "@/lib/server-adapters.server"
import { timerSchema } from "@/lib/schemas/timer"
import type { Timer } from "@/lib/types"
import { effectiveTargetDate } from "@/lib/utils"
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_VERSION,
  WEBHOOK_TEST_EVENT_TYPE,
  type CreatedWebhookEndpointRecord,
  type WebhookDeliveryEventType,
  type WebhookDeliveryPublicRecord,
  type WebhookEndpointPublicRecord,
  type WebhookEndpointStatus,
  type WebhookEventPayload,
  type WebhookEventType,
  normalizeWebhookEndpointStatus,
  normalizeWebhookEventTypes,
  webhookEndpointNameSchema,
  webhookEndpointUrlSchema,
  webhookEventTypesSchema,
} from "@/lib/webhook-events"

const WEBHOOK_SECRET_PREFIX = "whsec_"
const WEBHOOK_MAX_DELIVERY_ATTEMPTS = 5
const WEBHOOK_RESPONSE_BODY_LIMIT = 2000
const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000
const WEBHOOK_RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600, 10_800] as const
const LOCAL_WEBHOOK_HOSTNAMES = new Set(["localhost", "localhost.localdomain"])
const WEBHOOK_ENVIRONMENT_PATTERN = /^[a-z0-9._-]+$/
const WEBHOOK_TEST_MESSAGE = "Test webhook delivery."

const WEBHOOK_DEFAULT_MAX_ENDPOINTS_PER_USER = 3
// 25 consecutive failed attempts = 5 events exhausting all retries with no success in between.
const WEBHOOK_DEFAULT_AUTO_DISABLE_FAILURE_THRESHOLD = 25

function positiveIntEnv(name: ServerEnvVar, fallback: number) {
  const raw = optionalServerEnv(name)?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function webhookMaxEndpointsPerUser() {
  return positiveIntEnv("TICKWARD_WEBHOOK_MAX_ENDPOINTS", WEBHOOK_DEFAULT_MAX_ENDPOINTS_PER_USER)
}

export function webhookAutoDisableFailureThreshold() {
  return positiveIntEnv("TICKWARD_WEBHOOK_AUTO_DISABLE_FAILURES", WEBHOOK_DEFAULT_AUTO_DISABLE_FAILURE_THRESHOLD)
}

export class WebhookUrlSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebhookUrlSecurityError"
  }
}

export class WebhookEndpointLimitError extends Error {
  constructor() {
    super(`Webhook endpoint limit reached. Keep at most ${webhookMaxEndpointsPerUser()} active endpoints.`)
    this.name = "WebhookEndpointLimitError"
  }
}

export const WEBHOOK_CREATE_SCHEMA = z.object({
  event_types: webhookEventTypesSchema.optional(),
  name: webhookEndpointNameSchema,
  url: webhookEndpointUrlSchema,
})

export const WEBHOOK_UPDATE_SCHEMA = z.object({
  event_types: webhookEventTypesSchema.optional(),
  name: webhookEndpointNameSchema.optional(),
  status: z.enum(["active", "disabled"]).optional(),
  url: webhookEndpointUrlSchema.optional(),
})

type WebhookEndpointRow = {
  id: string
  name: string
  secret?: string
  url: string
  eventTypes: unknown
  status: string
  failureCount: number
  createdAt: Date
  updatedAt: Date
  disabledAt: Date | null
  lastDeliveredAt: Date | null
  lastFailedAt: Date | null
}

type WebhookDeliveryRow = {
  id: string
  endpointId: string
  eventId: string
  status: string
  attemptCount: number
  nextAttemptAt: Date
  lastAttemptAt: Date | null
  deliveredAt: Date | null
  failedAt: Date | null
  responseStatus: number | null
  error: string | null
  createdAt: Date
  updatedAt: Date
}

type WebhookEventRow = {
  id: string
  userId: string
  type: string
  aggregateType: string
  aggregateId: string
  projectId: string | null
  timerId: string | null
  shareId: string | null
  payload: unknown
  availableAt: Date
  occurredAt: Date
}

export type WebhookEventPayloadSource = {
  id: string
  type: string
  aggregateType: string
  aggregateId: string
  projectId: string | null
  timerId: string | null
  shareId: string | null
  payload: unknown
  occurredAt: Date
}

export type EmitWebhookEventInput = {
  aggregateId: string
  aggregateType: "project" | "timer" | "share"
  availableAt?: Date
  dedupeKey?: string
  payload: Record<string, unknown>
  projectId?: string | null
  shareId?: string | null
  timerId?: string | null
  type: WebhookEventType
  userId: string | null | undefined
}

export type SchedulerTickResult = {
  delivered: number
  delivery_failed: number
  delivery_retried: number
  events_completed: number
  events_failed: number
  events_picked: number
}

export type TestWebhookResult = {
  object: "webhook_test"
  endpoint: WebhookEndpointPublicRecord
  delivery: WebhookDeliveryPublicRecord
}

type WebhookTx = Prisma.TransactionClient

type WebhookEventDelegate = {
  create?: (args: { data: Record<string, unknown> }) => Promise<unknown>
  updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>
  upsert?: (args: {
    where: { dedupeKey: string }
    update: Record<string, unknown>
    create: Record<string, unknown>
  }) => Promise<unknown>
}

function webhookEventDelegate(tx: WebhookTx): WebhookEventDelegate | null {
  const delegate = (tx as unknown as { webhookEvent?: WebhookEventDelegate }).webhookEvent
  return delegate ?? null
}

function privateWebhookTargetsAllowed() {
  return (
    process.env.NODE_ENV !== "production" || optionalServerEnv("TICKWARD_WEBHOOK_ALLOW_PRIVATE_NETWORKS") === "true"
  )
}

function normalizeHostname(value: string) {
  return value.trim().replace(/^\[/, "").replace(/\]$/, "").toLowerCase()
}

function ipv4Parts(address: string) {
  return address.split(".").map((part) => Number(part))
}

function isUnsafeIpv4Address(address: string): boolean {
  const [first = -1, second = -1] = ipv4Parts(address)
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  )
}

function isUnsafeIpv6Address(address: string): boolean {
  const normalized = normalizeHostname(address)
  if (normalized === "::" || normalized === "::1") return true
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true
  if (normalized.startsWith("::ffff:")) return isUnsafeWebhookAddress(normalized.slice("::ffff:".length))
  return false
}

export function isUnsafeWebhookAddress(address: string): boolean {
  const normalized = normalizeHostname(address)
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) return isUnsafeIpv4Address(normalized)
  if (ipVersion === 6) return isUnsafeIpv6Address(normalized)
  return false
}

export function isUnsafeWebhookHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  return LOCAL_WEBHOOK_HOSTNAMES.has(normalized) || normalized.endsWith(".localhost")
}

export async function assertWebhookUrlIsDeliverable(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new WebhookUrlSecurityError("Webhook URL is invalid.")
  }

  if (url.username || url.password) {
    throw new WebhookUrlSecurityError("Webhook URL cannot include credentials.")
  }

  const allowPrivateTargets = privateWebhookTargetsAllowed()
  if (url.protocol !== "https:" && !allowPrivateTargets) {
    throw new WebhookUrlSecurityError("Webhook URL must use HTTPS.")
  }

  if (isUnsafeWebhookHostname(url.hostname) || isUnsafeWebhookAddress(url.hostname)) {
    if (!allowPrivateTargets) {
      throw new WebhookUrlSecurityError("Webhook URL cannot target a private network.")
    }
    return
  }

  const resolvedAddresses = isIP(url.hostname)
    ? [{ address: normalizeHostname(url.hostname) }]
    : await lookup(url.hostname, { all: true, verbatim: true }).catch(() => {
        throw new WebhookUrlSecurityError("Webhook URL host could not be resolved.")
      })

  if (!allowPrivateTargets && resolvedAddresses.some((record) => isUnsafeWebhookAddress(record.address))) {
    throw new WebhookUrlSecurityError("Webhook URL cannot target a private network.")
  }
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function createWebhookSecret() {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`
}

function dateString(value: Date | null | undefined) {
  return value?.toISOString() ?? null
}

function webhookEndpointRecord(row: WebhookEndpointRow): WebhookEndpointPublicRecord {
  return {
    id: row.id,
    object: "webhook_endpoint",
    name: row.name,
    url: row.url,
    event_types: normalizeWebhookEventTypes(row.eventTypes),
    status: normalizeWebhookEndpointStatus(row.status),
    failure_count: row.failureCount,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    disabled_at: dateString(row.disabledAt),
    last_delivered_at: dateString(row.lastDeliveredAt),
    last_failed_at: dateString(row.lastFailedAt),
  }
}

function webhookDeliveryRecord(row: WebhookDeliveryRow): WebhookDeliveryPublicRecord {
  const status =
    row.status === "delivered" || row.status === "failed" || row.status === "processing" ? row.status : "pending"
  return {
    id: row.id,
    object: "webhook_delivery",
    endpoint_id: row.endpointId,
    event_id: row.eventId,
    status,
    attempt_count: row.attemptCount,
    next_attempt_at: row.status === "delivered" ? null : dateString(row.nextAttemptAt),
    last_attempt_at: dateString(row.lastAttemptAt),
    delivered_at: dateString(row.deliveredAt),
    failed_at: dateString(row.failedAt),
    response_status: row.responseStatus,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function endpointEventTypes(value: unknown) {
  const types = normalizeWebhookEventTypes(value)
  return types.length > 0 ? types : [...WEBHOOK_EVENT_TYPES]
}

function webhookEnvironment() {
  const configured = optionalServerEnv("TICKWARD_ENVIRONMENT")?.trim().toLowerCase()
  if (configured && WEBHOOK_ENVIRONMENT_PATTERN.test(configured)) return configured
  if (process.env.NODE_ENV === "production") return "production"
  if (process.env.NODE_ENV === "test") return "test"
  return "development"
}

export async function listWebhookEndpointsForUser(user: UserRef): Promise<WebhookEndpointPublicRecord[]> {
  const prisma = requirePrismaClient()
  const rows = await prisma.webhookEndpoint.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })
  return rows.map(webhookEndpointRecord)
}

export async function createWebhookEndpointForUser(args: {
  eventTypes?: WebhookEventType[]
  name: string
  url: string
  user: UserRef
}): Promise<CreatedWebhookEndpointRecord> {
  const prisma = requirePrismaClient()
  await assertWebhookUrlIsDeliverable(args.url)
  const activeEndpoints = await prisma.webhookEndpoint.count({
    where: { status: "active", userId: args.user.id },
  })
  if (activeEndpoints >= webhookMaxEndpointsPerUser()) throw new WebhookEndpointLimitError()
  const secret = createWebhookSecret()
  const eventTypes = args.eventTypes && args.eventTypes.length > 0 ? args.eventTypes : [...WEBHOOK_EVENT_TYPES]
  const row = await prisma.webhookEndpoint.create({
    data: {
      eventTypes: eventTypes as Prisma.InputJsonValue,
      name: args.name,
      secret,
      url: args.url,
      userId: args.user.id,
    },
  })

  return { ...webhookEndpointRecord(row), signing_secret: secret }
}

export async function updateWebhookEndpointForUser(args: {
  eventTypes?: WebhookEventType[]
  id: string
  name?: string
  status?: WebhookEndpointStatus
  url?: string
  user: UserRef
}): Promise<WebhookEndpointPublicRecord | null> {
  const data: Prisma.WebhookEndpointUpdateInput = {}
  if (args.eventTypes !== undefined) data.eventTypes = args.eventTypes as Prisma.InputJsonValue
  if (args.name !== undefined) data.name = args.name
  if (args.url !== undefined) {
    await assertWebhookUrlIsDeliverable(args.url)
    data.url = args.url
  }
  if (args.status !== undefined) {
    data.status = args.status
    data.disabledAt = args.status === "disabled" ? new Date() : null
    // Re-activation starts a fresh failure streak; otherwise an endpoint at the
    // auto-disable threshold would be disabled again on the next failed attempt.
    if (args.status === "active") data.failureCount = 0
  }

  const rows = await requirePrismaClient().webhookEndpoint.updateManyAndReturn({
    where: { id: args.id, userId: args.user.id },
    data,
  })

  return rows[0] ? webhookEndpointRecord(rows[0]) : null
}

export async function disableWebhookEndpointForUser(args: {
  id: string
  user: UserRef
}): Promise<WebhookEndpointPublicRecord | null> {
  return updateWebhookEndpointForUser({ id: args.id, status: "disabled", user: args.user })
}

export async function removeWebhookEndpointForUser(args: { id: string; user: UserRef }): Promise<boolean> {
  const result = await requirePrismaClient().webhookEndpoint.deleteMany({
    where: { id: args.id, userId: args.user.id },
  })
  return result.count > 0
}

export async function emitWebhookEvent(tx: WebhookTx, input: EmitWebhookEventInput) {
  if (!input.userId) return null
  const delegate = webhookEventDelegate(tx)
  if (!delegate) return null

  const payload = {
    ...input.payload,
    aggregate_id: input.aggregateId,
    aggregate_type: input.aggregateType,
    project_id: input.projectId ?? undefined,
    share_id: input.shareId ?? undefined,
    timer_id: input.timerId ?? undefined,
  }

  const data = {
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    availableAt: input.availableAt ?? new Date(),
    payload: jsonInput(payload),
    projectId: input.projectId ?? null,
    shareId: input.shareId ?? null,
    timerId: input.timerId ?? null,
    type: input.type,
    userId: input.userId,
  }

  if (!input.dedupeKey) {
    if (!delegate.create) return null
    return delegate.create({ data })
  }

  if (!delegate.upsert) return null
  return delegate.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {
      ...data,
      attemptCount: 0,
      cancelledAt: null,
      error: null,
      processedAt: null,
      status: "pending",
    },
    create: {
      ...data,
      dedupeKey: input.dedupeKey,
    },
  })
}

function timerEndedDedupeKey(args: { projectId: string; timerId: string; occurrenceIso: string; userId: string }) {
  return `timer.ended:${args.userId}:${args.projectId}:${args.timerId}:${args.occurrenceIso}`
}

function timerPayload(project: { id: string; name: string }, timer: Timer) {
  return {
    project_id: project.id,
    project_name: project.name,
    timer_id: timer.id,
    timer_label: timer.label,
  }
}

export async function cancelPendingTimerEndedEvents(
  tx: WebhookTx,
  args: { projectId: string; timerId: string; userId: string | null | undefined },
) {
  if (!args.userId) return
  const delegate = webhookEventDelegate(tx)
  if (!delegate?.updateMany) return
  await delegate.updateMany({
    where: {
      projectId: args.projectId,
      status: "pending",
      timerId: args.timerId,
      type: "timer.ended",
      userId: args.userId,
    },
    data: { cancelledAt: new Date(), status: "cancelled" },
  })
}

export async function scheduleTimerEndedEvent(
  tx: WebhookTx,
  args: { project: { id: string; name: string; ownerId: string | null }; timer: Timer },
) {
  if (!args.project.ownerId || args.timer.archivedAt) {
    await cancelPendingTimerEndedEvents(tx, {
      projectId: args.project.id,
      timerId: args.timer.id,
      userId: args.project.ownerId,
    })
    return null
  }

  const occurrenceIso = effectiveTargetDate(args.timer, Date.now())
  const occurrenceAt = new Date(occurrenceIso)
  if (Number.isNaN(occurrenceAt.getTime())) return null

  await cancelPendingTimerEndedEvents(tx, {
    projectId: args.project.id,
    timerId: args.timer.id,
    userId: args.project.ownerId,
  })

  return emitWebhookEvent(tx, {
    aggregateId: args.timer.id,
    aggregateType: "timer",
    availableAt: occurrenceAt,
    dedupeKey: timerEndedDedupeKey({
      occurrenceIso,
      projectId: args.project.id,
      timerId: args.timer.id,
      userId: args.project.ownerId,
    }),
    payload: {
      ...timerPayload(args.project, args.timer),
      effective_target_date: occurrenceIso,
      target_date: args.timer.targetDate,
      timezone: args.timer.timezone,
    },
    projectId: args.project.id,
    timerId: args.timer.id,
    type: "timer.ended",
    userId: args.project.ownerId,
  })
}

export function createWebhookDeliveryPayload(event: WebhookEventPayloadSource): WebhookEventPayload {
  const rawPayload =
    event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {}
  const payload = { ...rawPayload }
  delete payload.aggregate_id
  delete payload.aggregate_type
  delete payload.id
  delete payload.object

  return {
    object: "event",
    id: event.id,
    type: event.type as WebhookDeliveryEventType,
    created: event.occurredAt.toISOString(),
    environment: webhookEnvironment(),
    event_version: WEBHOOK_EVENT_VERSION,
    data: {
      object: {
        ...payload,
        id: event.aggregateId,
        object: event.aggregateType,
        project_id: event.projectId ?? (typeof payload.project_id === "string" ? payload.project_id : undefined),
        share_id: event.shareId ?? (typeof payload.share_id === "string" ? payload.share_id : undefined),
        timer_id: event.timerId ?? (typeof payload.timer_id === "string" ? payload.timer_id : undefined),
      },
    },
  }
}

function webhookSignature(secret: string, payload: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex")
}

export function signWebhookPayload(secret: string, payload: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${webhookSignature(secret, payload, timestamp)}`
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function verifySchedulerSecret(header: string | null) {
  const secret = optionalServerEnv("TICKWARD_SCHEDULER_SECRET")
  if (!secret) return false
  const token = header?.trim().replace(/^Bearer\s+/i, "")
  return Boolean(token && safeEqual(token, secret))
}

async function pickDueEvents(limit: number) {
  const prisma = requirePrismaClient()
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "webhook_event"
      WHERE "status" = 'pending'
        AND "availableAt" <= now()
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
    const ids = rows.map((row) => row.id)
    if (ids.length === 0) return []

    await tx.webhookEvent.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: { attemptCount: { increment: 1 }, status: "processing" },
    })

    return tx.webhookEvent.findMany({ where: { id: { in: ids } }, orderBy: { availableAt: "asc" } })
  })
}

async function createDeliveriesForEvent(event: WebhookEventRow) {
  const prisma = requirePrismaClient()
  return prisma.$transaction(async (tx) => {
    const endpoints = await tx.webhookEndpoint.findMany({
      where: { status: "active", userId: event.userId },
      orderBy: { createdAt: "asc" },
    })
    const matchingEndpoints = endpoints.filter((endpoint) =>
      endpointEventTypes(endpoint.eventTypes).includes(event.type as WebhookEventType),
    )

    for (const endpoint of matchingEndpoints) {
      await tx.webhookDelivery.upsert({
        where: { eventId_endpointId: { endpointId: endpoint.id, eventId: event.id } },
        update: {},
        create: {
          endpointId: endpoint.id,
          eventId: event.id,
          userId: event.userId,
        },
      })
    }

    await tx.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), status: "completed" },
    })

    if (event.type === "timer.ended" && event.projectId && event.timerId) {
      const row = await tx.timer.findFirst({
        where: { id: event.timerId, projectId: event.projectId },
        include: { project: true },
      })
      const timer = timerSchema.safeParse(row?.data)
      if (row?.project && timer.success && timer.data.recurrence?.enabled && !timer.data.archivedAt) {
        await scheduleTimerEndedEvent(tx, {
          project: { id: row.project.id, name: row.project.name, ownerId: row.project.ownerId },
          timer: timer.data,
        })
      }
    }

    return matchingEndpoints.length
  })
}

async function pickDueDeliveries(limit: number) {
  const prisma = requirePrismaClient()
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "webhook_delivery"
      WHERE "status" IN ('pending', 'failed')
        AND "nextAttemptAt" <= now()
        AND "attemptCount" < ${WEBHOOK_MAX_DELIVERY_ATTEMPTS}
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
    const ids = rows.map((row) => row.id)
    if (ids.length === 0) return []

    await tx.webhookDelivery.updateMany({
      where: { id: { in: ids } },
      data: { status: "processing" },
    })

    return tx.webhookDelivery.findMany({
      where: { id: { in: ids } },
      include: { endpoint: true, event: true },
      orderBy: { nextAttemptAt: "asc" },
    })
  })
}

function nextRetryAt(attemptCount: number) {
  const seconds = WEBHOOK_RETRY_BACKOFF_SECONDS[Math.min(attemptCount - 1, WEBHOOK_RETRY_BACKOFF_SECONDS.length - 1)]
  return new Date(Date.now() + seconds * 1000)
}

async function responseText(res: Response) {
  const text = await res.text().catch(() => "")
  return text.slice(0, WEBHOOK_RESPONSE_BODY_LIMIT)
}

async function deliverWebhook(
  delivery: Awaited<ReturnType<typeof pickDueDeliveries>>[number],
  options: { retryFailures?: boolean } = {},
): Promise<"delivered" | "failed" | "retried"> {
  const payload = JSON.stringify(createWebhookDeliveryPayload(delivery.event))
  const timestamp = Math.floor(Date.now() / 1000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_REQUEST_TIMEOUT_MS)
  const attemptCount = delivery.attemptCount + 1

  try {
    await assertWebhookUrlIsDeliverable(delivery.endpoint.url)
    const res = await fetch(delivery.endpoint.url, {
      body: payload,
      headers: {
        "content-type": "application/json",
        "tickward-delivery-id": delivery.id,
        "tickward-event-id": delivery.event.id,
        "tickward-event-type": delivery.event.type,
        "tickward-signature": signWebhookPayload(delivery.endpoint.secret, payload, timestamp),
        "user-agent": "tickward-webhooks/1.0",
      },
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const body = await responseText(res)
    if (res.ok) {
      await requirePrismaClient().$transaction([
        requirePrismaClient().webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            attemptCount,
            deliveredAt: new Date(),
            error: null,
            lastAttemptAt: new Date(),
            responseBody: body || null,
            responseStatus: res.status,
            status: "delivered",
          },
        }),
        requirePrismaClient().webhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: { failureCount: 0, lastDeliveredAt: new Date() },
        }),
      ])
      return "delivered"
    }

    return markDeliveryFailed(delivery.id, delivery.endpointId, attemptCount, `HTTP ${res.status}`, res.status, body, {
      retryFailures: options.retryFailures ?? true,
    })
  } catch (error) {
    clearTimeout(timeout)
    return markDeliveryFailed(
      delivery.id,
      delivery.endpointId,
      attemptCount,
      error instanceof Error ? error.message : "Webhook delivery failed.",
      null,
      null,
      { retryFailures: options.retryFailures ?? true },
    )
  }
}

async function markDeliveryFailed(
  deliveryId: string,
  endpointId: string,
  attemptCount: number,
  error: string,
  responseStatus: number | null,
  responseBody: string | null,
  options: { retryFailures?: boolean } = {},
): Promise<"failed" | "retried"> {
  const exhausted = !options.retryFailures || attemptCount >= WEBHOOK_MAX_DELIVERY_ATTEMPTS
  const now = new Date()
  const [, , autoDisabled] = await requirePrismaClient().$transaction([
    requirePrismaClient().webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attemptCount,
        error,
        failedAt: exhausted ? now : null,
        lastAttemptAt: now,
        nextAttemptAt: exhausted ? now : nextRetryAt(attemptCount),
        responseBody,
        responseStatus,
        status: exhausted ? "failed" : "pending",
      },
    }),
    requirePrismaClient().webhookEndpoint.update({
      where: { id: endpointId },
      data: { failureCount: { increment: 1 }, lastFailedAt: now },
    }),
    requirePrismaClient().webhookEndpoint.updateMany({
      where: {
        failureCount: { gte: webhookAutoDisableFailureThreshold() },
        id: endpointId,
        status: "active",
      },
      data: { disabledAt: now, status: "disabled" },
    }),
  ])
  if (autoDisabled.count > 0) await notifyWebhookEndpointAutoDisabled(endpointId)
  return exhausted ? "failed" : "retried"
}

async function notifyWebhookEndpointAutoDisabled(endpointId: string) {
  try {
    const endpoint = await requirePrismaClient().webhookEndpoint.findUnique({
      where: { id: endpointId },
      include: { user: true },
    })
    if (!endpoint?.user?.email) return
    const { mailProvider } = getServerAdapters()
    if (!mailProvider.isConfigured()) return
    await mailProvider.sendWebhookEndpointDisabledEmail({
      to: endpoint.user.email,
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      endpointUrl: endpoint.url,
      failureCount: endpoint.failureCount,
    })
  } catch (error) {
    console.error("[tickward] webhooks.autoDisableEmail", error)
  }
}

export async function dispatchDueWebhookEvents(limit = 50) {
  const events = await pickDueEvents(limit)
  let completed = 0
  let failed = 0

  for (const event of events) {
    try {
      await createDeliveriesForEvent(event)
      completed += 1
    } catch (error) {
      failed += 1
      await requirePrismaClient().webhookEvent.update({
        where: { id: event.id },
        data: {
          error: error instanceof Error ? error.message : "Webhook event dispatch failed.",
          status: event.attemptCount + 1 >= WEBHOOK_MAX_DELIVERY_ATTEMPTS ? "failed" : "pending",
        },
      })
    }
  }

  return { completed, failed, picked: events.length }
}

export async function deliverDueWebhooks(limit = 50) {
  const deliveries = await pickDueDeliveries(limit)
  let delivered = 0
  let failed = 0
  let retried = 0

  for (const delivery of deliveries) {
    const result = await deliverWebhook(delivery)
    if (result === "delivered") delivered += 1
    if (result === "failed") failed += 1
    if (result === "retried") retried += 1
  }

  return { delivered, failed, picked: deliveries.length, retried }
}

export async function runWebhookSchedulerTick(
  args: { deliveryLimit?: number; eventLimit?: number } = {},
): Promise<SchedulerTickResult> {
  const events = await dispatchDueWebhookEvents(args.eventLimit ?? 50)
  const deliveries = await deliverDueWebhooks(args.deliveryLimit ?? 50)
  return {
    delivered: deliveries.delivered,
    delivery_failed: deliveries.failed,
    delivery_retried: deliveries.retried,
    events_completed: events.completed,
    events_failed: events.failed,
    events_picked: events.picked,
  }
}

function sampleWebhookEventData(type: WebhookEventType) {
  const project = { project_id: "project_sample", project_name: "Sample project" }
  if (type.startsWith("timer.")) {
    return {
      aggregateId: "timer_sample",
      aggregateType: "timer",
      payload: { ...project, timer_id: "timer_sample", timer_label: "Sample timer" },
    }
  }
  if (type.startsWith("share.")) {
    return {
      aggregateId: "share_sample",
      aggregateType: "share",
      payload: { ...project, share_id: "share_sample", timer_id: "timer_sample", timer_label: "Sample timer" },
    }
  }
  return { aggregateId: "project_sample", aggregateType: "project", payload: project }
}

export async function sendTestWebhookForUser(args: {
  id: string
  user: UserRef
  eventType?: WebhookEventType
}): Promise<TestWebhookResult | null> {
  const prisma = requirePrismaClient()
  const delivery = await prisma.$transaction(async (tx) => {
    const endpoint = await tx.webhookEndpoint.findFirst({
      where: { id: args.id, status: "active", userId: args.user.id },
    })
    if (!endpoint) return null

    const sample = args.eventType ? sampleWebhookEventData(args.eventType) : null
    const event = await tx.webhookEvent.create({
      data: {
        aggregateId: sample ? sample.aggregateId : endpoint.id,
        aggregateType: sample ? sample.aggregateType : "webhook_endpoint",
        payload: jsonInput(
          sample
            ? sample.payload
            : {
                message: WEBHOOK_TEST_MESSAGE,
                webhook_endpoint_id: endpoint.id,
                webhook_endpoint_name: endpoint.name,
              },
        ),
        processedAt: new Date(),
        status: "completed",
        type: args.eventType ?? WEBHOOK_TEST_EVENT_TYPE,
        userId: args.user.id,
      },
    })

    return tx.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        eventId: event.id,
        status: "processing",
        userId: args.user.id,
      },
      include: { endpoint: true, event: true },
    })
  })

  if (!delivery) return null

  await deliverWebhook(delivery, { retryFailures: false })

  const [updatedDelivery, updatedEndpoint] = await Promise.all([
    prisma.webhookDelivery.findUnique({ where: { id: delivery.id } }),
    prisma.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } }),
  ])

  if (!updatedDelivery || !updatedEndpoint) return null

  return {
    object: "webhook_test",
    delivery: webhookDeliveryRecord(updatedDelivery),
    endpoint: webhookEndpointRecord(updatedEndpoint),
  }
}

export async function listRecentWebhookDeliveriesForUser(
  user: UserRef,
  options: { endpointId?: string; limit?: number } = {},
): Promise<WebhookDeliveryPublicRecord[]> {
  const rows = await requirePrismaClient().webhookDelivery.findMany({
    where: { userId: user.id, ...(options.endpointId ? { endpointId: options.endpointId } : {}) },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 10,
  })
  return rows.map(webhookDeliveryRecord)
}

import "server-only"

import { createHash } from "node:crypto"

import { nanoid } from "nanoid"
import { z } from "zod"

import { apiError, apiJson, apiList, isResponse, type ApiErrorType } from "@/lib/api-response"
import {
  MCP_CREDENTIAL_KIND,
  authenticateApiKey,
  type AuthenticatedApiKey,
  readBearerApiKey,
} from "@/lib/api-keys.server"
import type { UserRef } from "@/lib/contracts"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"
import { getEntitlements } from "@/lib/entitlements"
import { getMcpRemoteUrl } from "@/lib/mcp-config.server"
import type { McpOAuthScope } from "@/lib/mcp-oauth"
import { timerNotificationsEnabled } from "@/lib/notification-preferences"
import { type ProjectSnapshotV2, createProjectSnapshot, isProjectSnapshot } from "@/lib/project-model"
import { checkRateLimit } from "@/lib/rate-limit.server"
import { stableShareId } from "@/lib/static-share-id.server"
import type { Space, Timer } from "@/lib/types"
import { effectiveTargetDate } from "@/lib/utils"
import {
  WEBHOOK_CREATE_SCHEMA,
  WebhookEndpointLimitError,
  WebhookUrlSecurityError,
  cancelPendingTimerEndedEvents,
  createWebhookEndpointForUser,
  emitWebhookEvent,
  listRecentWebhookDeliveriesForUser,
  listWebhookEndpointsForUser,
  removeWebhookEndpointForUser,
  scheduleTimerEndedEvent,
  sendTestWebhookForUser,
  updateWebhookEndpointForUser,
} from "@/lib/webhooks.server"
import { webhookEventTypeSchema, type WebhookEventType } from "@/lib/webhook-events"
import {
  colorSchema,
  recurrenceSchema,
  targetDateSchema,
  timezoneSchema,
  unsplashImageSchema,
} from "@/lib/schemas/timer"

export const PUBLIC_API_VERSION = "v1"

type PublicApiContext = {
  apiKey: AuthenticatedApiKey
}

type ProjectRow = {
  id: string
  ownerId: string | null
  name: string
  color: string | null
  snapshot: unknown
  createdAt: Date
  updatedAt: Date
  claimedAt: Date | null
}

type PublicApiIdempotencyRow = {
  id: string
  apiKeyId: string
  userId: string
  keyHash: string
  requestHash: string
  method: string
  path: string
  responseStatus: number | null
  responseBody: unknown
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  expiresAt: Date
}

type PublicApiIdempotencyDelegate = {
  create(args: {
    data: {
      apiKeyId: string
      userId: string
      keyHash: string
      requestHash: string
      method: string
      path: string
      expiresAt: Date
    }
  }): Promise<PublicApiIdempotencyRow>
  delete(args: { where: { id: string } }): Promise<unknown>
  deleteMany?(args: { where: { expiresAt: { lt: Date } } }): Promise<unknown>
  findUnique(args: {
    where: { apiKeyId_keyHash: { apiKeyId: string; keyHash: string } }
  }): Promise<PublicApiIdempotencyRow | null>
  update(args: {
    data: {
      completedAt?: Date
      responseBody?: Prisma.InputJsonValue
      responseStatus?: number
    }
    where: { id: string }
  }): Promise<PublicApiIdempotencyRow>
}

type ListParams = {
  after?: string
  before?: string
  limit: number
}

type PublicApiRequestMetadata = {
  correlationId: string
  requestId: string
}

type PublicApiErrorBody = {
  error: {
    code?: string
    correlation_id?: string
    details?: unknown
    errors?: Array<{ code: string; message: string; path: string; remediation: string }>
    message: string
    remediation?: { hint: string }
    request_id?: string
    retryable?: boolean
    type: ApiErrorType
  }
}

const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"
const IDEMPOTENCY_KEY_TTL_HOURS = 24
const IDEMPOTENCY_KEY_TTL_MS = IDEMPOTENCY_KEY_TTL_HOURS * 60 * 60 * 1000
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)

class PublicApiIdempotencyStorageUnavailableError extends Error {
  constructor() {
    super("Prisma Client is missing the publicApiIdempotencyKey delegate. Run prisma generate and migrate.")
    this.name = "PublicApiIdempotencyStorageUnavailableError"
  }
}

function publicApiRequestId(prefix: "corr" | "req") {
  return `${prefix}_${nanoid(24)}`
}

function normalizedHeaderId(value: string | null) {
  const trimmed = value?.trim()
  return trimmed && /^[A-Za-z0-9._:-]{6,128}$/.test(trimmed) ? trimmed : null
}

function publicApiRequestMetadata(req: Request): PublicApiRequestMetadata {
  return {
    correlationId: normalizedHeaderId(req.headers.get("x-correlation-id")) ?? publicApiRequestId("corr"),
    requestId: publicApiRequestId("req"),
  }
}

function publicApiMetadataHeaders(meta: PublicApiRequestMetadata): HeadersInit {
  return {
    "Correlation-Id": meta.correlationId,
    "Request-Id": meta.requestId,
  }
}

function isPublicApiErrorBody(value: unknown): value is PublicApiErrorBody {
  if (!value || typeof value !== "object" || !("error" in value)) return false
  const error = (value as { error?: unknown }).error
  if (!error || typeof error !== "object") return false
  const candidate = error as { message?: unknown; type?: unknown }
  return typeof candidate.type === "string" && typeof candidate.message === "string"
}

function retryableApiError(type: ApiErrorType) {
  return (
    type === "idempotency_key_in_progress" ||
    type === "rate_limit_unavailable" ||
    type === "rate_limited" ||
    type === "storage_unavailable"
  )
}

function remediationHint(type: ApiErrorType) {
  switch (type) {
    case "idempotency_conflict":
      return "Use the original request with this Idempotency-Key, or generate a new key for a new operation."
    case "idempotency_key_in_progress":
      return "Retry the same request with the same Idempotency-Key after a short delay."
    case "invalid_api_key":
    case "missing_api_key":
      return "Create an API key or connect an MCP client, then send the credential as an Authorization Bearer token."
    case "insufficient_scope":
      return "Reconnect the MCP client with the required scope, or use credentials with broader access."
    case "limit_exceeded":
      return "Remove or disable an existing resource of this type, then retry the request."
    case "method_not_allowed":
      return "Use one of the documented methods for this endpoint."
    case "not_found":
      return "Check the resource id and confirm the API key can access it."
    case "plan_hash_mismatch":
      return "Call the preview endpoint again with the current request body, then retry with the returned plan_hash."
    case "rate_limit_unavailable":
    case "storage_unavailable":
      return "Try again later."
    case "rate_limited":
      return "Retry after the Retry-After header."
    case "restricted_api_key":
      return "Use a full-access API key for write requests."
    case "unauthorized":
      return "Sign in or provide valid credentials."
    case "validation_error":
      return "Fix the fields listed in details or errors and retry the request."
  }
}

function jsonPointerPath(path: unknown) {
  if (!Array.isArray(path)) return undefined
  if (path.length === 0) return "#"
  return `#/${path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`
}

function publicApiErrorItems(type: ApiErrorType, details: unknown) {
  if (!Array.isArray(details)) return undefined

  const items = details.flatMap((detail) => {
    if (!detail || typeof detail !== "object") return []
    const message = (detail as { message?: unknown }).message
    const path = jsonPointerPath((detail as { path?: unknown }).path)
    if (typeof message !== "string" || !path) return []
    return [{ code: type, message, path, remediation: remediationHint(type) }]
  })

  return items.length > 0 ? items : undefined
}

function augmentPublicApiErrorBody(body: PublicApiErrorBody, meta: PublicApiRequestMetadata): PublicApiErrorBody {
  const error = body.error
  return {
    error: {
      ...error,
      code: error.code ?? error.type,
      correlation_id: error.correlation_id ?? meta.correlationId,
      errors: error.errors ?? publicApiErrorItems(error.type, error.details),
      remediation: error.remediation ?? { hint: remediationHint(error.type) },
      request_id: error.request_id ?? meta.requestId,
      retryable: error.retryable ?? retryableApiError(error.type),
    },
  }
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function nonEmptyOrNull(value: string | null | undefined) {
  if (!value) return null
  return value
}

function nonEmptyOrUndefined(value: string | null | undefined) {
  if (!value) return undefined
  return value
}

function isMutatingMethod(method: string) {
  return method === "POST" || method === "PATCH" || method === "DELETE"
}

function requestTarget(req: Request) {
  const url = new URL(req.url)
  const params = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
  )
  const search = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : ""
  return `${url.pathname}${search}`
}

function isDryRunRequest(req: Request) {
  return new URL(req.url).searchParams.get("dry_run") === "true"
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  const stableEntries = entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
  return `{${stableEntries.join(",")}}`
}

function canonicalRequestBody(rawBody: string) {
  const trimmed = rawBody.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return rawBody

  try {
    return stableJson(JSON.parse(rawBody))
  } catch {
    return rawBody
  }
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function idempotencyKeyHash(ctx: PublicApiContext, key: string) {
  return sha256Hex(`tickward:public-api-idempotency-key:${ctx.apiKey.id}:${key}`)
}

async function idempotentRequestHash(method: string, req: Request) {
  const body = await req.clone().text()
  return sha256Hex(JSON.stringify({ body: canonicalRequestBody(body), method, path: requestTarget(req) }))
}

function publicApiIdempotencyKeyDelegate(): PublicApiIdempotencyDelegate {
  const prisma = requirePrismaClient() as unknown as {
    publicApiIdempotencyKey?: PublicApiIdempotencyDelegate
  }
  if (!prisma.publicApiIdempotencyKey) throw new PublicApiIdempotencyStorageUnavailableError()
  return prisma.publicApiIdempotencyKey
}

function isPrismaUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
}

function idempotencyReplayOrConflict(row: PublicApiIdempotencyRow, requestHash: string): Response {
  const headers = { "Idempotency-Key-Expires-At": row.expiresAt.toISOString() }

  if (row.requestHash !== requestHash) {
    return apiError("idempotency_conflict", "Idempotency-Key was already used for a different request.", {
      headers,
      status: 409,
    })
  }

  if (!row.completedAt || row.responseStatus === null || row.responseBody === null) {
    return apiError("idempotency_key_in_progress", "A request with this Idempotency-Key is still processing.", {
      headers: { ...headers, "Retry-After": "1" },
      status: 409,
    })
  }

  return apiJson(row.responseBody, {
    headers: { ...headers, "Idempotency-Replayed": "true" },
    status: row.responseStatus,
  })
}

function idempotencyKeyFromRequest(req: Request): string | Response | null {
  const rawKey = req.headers.get(IDEMPOTENCY_KEY_HEADER)
  if (rawKey === null) return null

  const parsed = idempotencyKeySchema.safeParse(rawKey)
  if (parsed.success) return parsed.data

  return apiError(
    "validation_error",
    "Idempotency-Key must be 8 to 128 characters and contain only letters, numbers, dots, dashes, underscores, or colons.",
    { status: 400 },
  )
}

async function startIdempotentRequest(ctx: PublicApiContext, method: string, req: Request, key: string) {
  const delegate = publicApiIdempotencyKeyDelegate()
  const keyHash = idempotencyKeyHash(ctx, key)
  const requestHash = await idempotentRequestHash(method, req)
  const where = { apiKeyId_keyHash: { apiKeyId: ctx.apiKey.id, keyHash } }
  const now = new Date()
  await delegate.deleteMany?.({ where: { expiresAt: { lt: now } } }).catch(() => undefined)
  const existing = await delegate.findUnique({ where })

  if (existing && existing.expiresAt.getTime() > now.getTime()) {
    return idempotencyReplayOrConflict(existing, requestHash)
  }

  if (existing) {
    await delegate.delete({ where: { id: existing.id } }).catch(() => undefined)
  }

  try {
    const row = await delegate.create({
      data: {
        apiKeyId: ctx.apiKey.id,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_KEY_TTL_MS),
        keyHash,
        method,
        path: requestTarget(req),
        requestHash,
        userId: ctx.apiKey.user.id,
      },
    })
    return { delegate, row }
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error)) throw error

    const racedRow = await delegate.findUnique({ where })
    if (racedRow) return idempotencyReplayOrConflict(racedRow, requestHash)
    throw error
  }
}

async function completeIdempotentRequest(args: {
  delegate: PublicApiIdempotencyDelegate
  response: Response
  row: PublicApiIdempotencyRow
}) {
  if (args.response.status >= 500) {
    await args.delegate.delete({ where: { id: args.row.id } }).catch(() => undefined)
    return args.response
  }

  const responseBody = await args.response.clone().json()
  await args.delegate.update({
    data: {
      completedAt: new Date(),
      responseBody: jsonInput(responseBody),
      responseStatus: args.response.status,
    },
    where: { id: args.row.id },
  })
  return withHeaders(args.response, { "Idempotency-Key-Expires-At": args.row.expiresAt.toISOString() })
}

function nowIso() {
  return new Date().toISOString()
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null
}

function ownedProjectWhere(projectId: string, user: UserRef) {
  return user.role === "admin" ? { id: projectId } : { id: projectId, ownerId: user.id }
}

function ownedProjectsWhere(user: UserRef) {
  return user.role === "admin" ? {} : { ownerId: user.id }
}

async function lockedProjectForUser(
  tx: Prisma.TransactionClient,
  projectId: string,
  user: UserRef,
): Promise<ProjectRow | null> {
  const rows =
    user.role === "admin"
      ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "project" WHERE id = ${projectId} FOR UPDATE`
      : await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "project"
          WHERE id = ${projectId} AND "ownerId" = ${user.id}
          FOR UPDATE
        `

  if (rows.length === 0) return null
  return tx.project.findUnique({ where: { id: projectId } })
}

function projectSnapshot(row: Pick<ProjectRow, "snapshot">): ProjectSnapshotV2 | null {
  return isProjectSnapshot(row.snapshot) ? row.snapshot : null
}

function projectObject(row: ProjectRow) {
  const snapshot = projectSnapshot(row)
  return {
    object: "project" as const,
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    claimed_at: iso(row.claimedAt),
    timer_count: snapshot?.timers.length ?? 0,
    space_count: snapshot?.spaces.length ?? 0,
  }
}

function timerObject(project: Pick<ProjectRow, "id" | "name">, timer: Timer) {
  return {
    object: "timer" as const,
    id: timer.id,
    project_id: project.id,
    project_name: project.name,
    label: timer.label,
    target_date: timer.targetDate,
    effective_target_date: effectiveTargetDate(timer, Date.now()),
    timezone: timer.timezone,
    created_at: timer.createdAt,
    updated_at: timer.updatedAt ?? timer.createdAt,
    archived_at: timer.archivedAt ?? null,
    color: timer.color ?? null,
    description: timer.description ?? null,
    space_id: timer.spaceId ?? null,
    shared_at: timer.sharedAt ?? null,
    notify: timerNotificationsEnabled(timer.notification, timer.notify),
    recurrence: timer.recurrence ?? null,
    pinned: timer.pinned ?? false,
    image: timer.image ?? null,
  }
}

function spaceObject(project: Pick<ProjectRow, "id" | "name">, space: Space) {
  return {
    object: "space" as const,
    id: space.id,
    project_id: project.id,
    project_name: project.name,
    name: space.name,
    color: space.color ?? null,
    created_at: space.createdAt,
  }
}

function shareObject(
  project: Pick<ProjectRow, "id" | "name" | "snapshot">,
  row: { id: string; data: unknown; createdAt: Date; updatedAt: Date },
  timerOverride?: Timer,
) {
  const data = shareDataSchema.safeParse(row.data)
  const snapshot = projectSnapshot(project)
  const timer =
    timerOverride ?? (data.success ? snapshot?.timers.find((item) => item.id === data.data.timerId) : undefined)

  return {
    object: "share" as const,
    id: row.id,
    project_id: project.id,
    project_name: project.name,
    timer_id: data.success ? data.data.timerId : null,
    timer_label: timer?.label ?? null,
    shared_at: data.success ? data.data.sharedAt : null,
    url_path: `/share/${row.id}`,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function listParams(req: Request): ListParams | Response {
  const url = new URL(req.url)
  const after = nonEmptyOrUndefined(url.searchParams.get("after")?.trim())
  const before = nonEmptyOrUndefined(url.searchParams.get("before")?.trim())
  if (after && before) {
    return apiError("validation_error", "Use either after or before, not both.", { status: 400 })
  }

  const rawLimit = url.searchParams.get("limit")
  const parsedLimit = rawLimit ? Number(rawLimit) : 100
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return apiError("validation_error", "limit must be an integer between 1 and 100.", { status: 400 })
  }

  return { after, before, limit: parsedLimit }
}

async function readJson(req: Request) {
  try {
    return await req.json()
  } catch {
    return apiError("validation_error", "Request body must be valid JSON.", { status: 400 })
  }
}

async function projectForUser(projectId: string, user: UserRef): Promise<ProjectRow | null> {
  return requirePrismaClient().project.findFirst({
    where: ownedProjectWhere(projectId, user),
  })
}

function requireSnapshot(row: ProjectRow | null): ProjectSnapshotV2 | Response {
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const snapshot = projectSnapshot(row)
  if (!snapshot) {
    return apiError("storage_unavailable", "Project snapshot is unavailable.", { status: 503 })
  }
  return snapshot
}

function writeProjectFields(snapshot: ProjectSnapshotV2) {
  return {
    color: snapshot.color ?? null,
    name: snapshot.name,
    snapshot: jsonInput(snapshot),
    updatedAt: new Date(snapshot.updatedAt),
  }
}

function timerRowData(projectId: string, ownerId: string | null, timer: Timer) {
  return {
    id: timer.id,
    projectId,
    ownerId,
    data: jsonInput(timer),
    createdAt: new Date(timer.createdAt),
    updatedAt: new Date(timer.updatedAt ?? timer.createdAt),
    archivedAt: timer.archivedAt ? new Date(timer.archivedAt) : null,
  }
}

function spaceRowData(projectId: string, ownerId: string | null, space: Space) {
  return {
    id: space.id,
    projectId,
    ownerId,
    data: jsonInput(space),
    createdAt: new Date(space.createdAt),
    updatedAt: new Date(space.createdAt),
  }
}

function changedSnapshot(snapshot: ProjectSnapshotV2, patch: Partial<ProjectSnapshotV2>): ProjectSnapshotV2 {
  return { ...snapshot, ...patch, updatedAt: nowIso() }
}

function readPermissionDenied() {
  return apiError("restricted_api_key", "This API key is read-only.", { status: 401 })
}

function authorizeWrite(ctx: PublicApiContext): Response | null {
  return ctx.apiKey.permission === "full_access" ? null : readPermissionDenied()
}

function validateProjectWriteAccess(ctx: PublicApiContext) {
  return authorizeWrite(ctx)
}

function requiredMcpScope(method: string, path: string[]): McpOAuthScope | null {
  const [resource, projectId, child] = path
  const action = method === "GET" ? "read" : "write"

  if (resource === "webhooks") return `webhooks:${action}` as McpOAuthScope
  if (resource === "projects" && projectId === "preview" && path.length === 2) return "projects:write"
  if (resource === "projects" && path.length <= 2) return `projects:${action}` as McpOAuthScope
  if (resource === "projects" && projectId && child === "timers") return `timers:${action}` as McpOAuthScope
  if (resource === "projects" && projectId && child === "spaces") return `spaces:${action}` as McpOAuthScope
  if (resource === "projects" && projectId && child === "shares") return `shares:${action}` as McpOAuthScope

  return null
}

function authorizeMcpScope(ctx: PublicApiContext, method: string, path: string[]): Response | null {
  if (ctx.apiKey.kind !== MCP_CREDENTIAL_KIND) return null

  const scope = requiredMcpScope(method, path)
  if (!scope || ctx.apiKey.scopes.includes(scope)) return null

  return apiError("insufficient_scope", `MCP connection is missing ${scope}.`, {
    details: {
      granted_scopes: ctx.apiKey.scopes,
      required_scope: scope,
    },
    status: 403,
  })
}

function publicApiCapabilities() {
  return apiJson({
    object: "capabilities",
    api_version: PUBLIC_API_VERSION,
    features: {
      idempotency_key: {
        enabled: true,
        ttl_hours: IDEMPOTENCY_KEY_TTL_HOURS,
      },
      delete_preview: {
        project: true,
        space: true,
        timer: false,
      },
      project_preview: true,
      nested_project_create: true,
      mcp: {
        remote_oauth: Boolean(getMcpRemoteUrl()),
      },
      timer_webhooks: true,
      webhook_management: true,
      timer_reminders: false,
    },
    limits: {
      project_create_max_spaces: getEntitlements().maxSpaces,
      project_create_max_timers: getEntitlements().maxSnapshotTimers,
      page_size_max: 100,
    },
  })
}

const projectBaseCreateSchema = z.object({
  color: colorSchema,
  name: z.string().trim().min(1).max(40),
})

const projectUpdateSchema = z.object({
  color: colorSchema.nullable().optional(),
  name: z.string().trim().min(1).max(40).optional(),
})

const timerCreateSchema = z
  .object({
    color: colorSchema,
    description: z.string().trim().max(200).optional(),
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{6,128}$/)
      .optional(),
    image: unsplashImageSchema.optional(),
    label: z.string().trim().min(1).max(200),
    notification: z.never().optional(),
    notify: z.boolean().optional(),
    pinned: z.boolean().optional(),
    recurrence: recurrenceSchema.optional(),
    space_id: z.string().min(1).max(64).nullable().optional(),
    target_date: targetDateSchema,
    timezone: timezoneSchema,
  })
  .strict()

const timerPatchSchema = timerCreateSchema
  .omit({ id: true, label: true, target_date: true, timezone: true })
  .extend({
    archived_at: z.string().nullable().optional(),
    label: z.string().trim().min(1).max(200).optional(),
    target_date: targetDateSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .partial()

const spaceCreateSchema = z.object({
  color: colorSchema,
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{3,64}$/)
    .optional(),
  name: z.string().trim().min(1).max(30),
})

const projectNestedTimerCreateSchema = timerCreateSchema.omit({ space_id: true }).extend({
  space_id: z.never().optional(),
})

const projectNestedSpaceCreateSchema = spaceCreateSchema.extend({
  timers: z.array(projectNestedTimerCreateSchema).optional(),
})

const projectCreateSchema = projectBaseCreateSchema.extend({
  expected_plan_hash: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
  spaces: z.array(projectNestedSpaceCreateSchema).optional(),
  timers: z.array(timerCreateSchema).optional(),
})

const spacePatchSchema = z.object({
  color: colorSchema.nullable().optional(),
  name: z.string().trim().min(1).max(30).optional(),
})

const shareCreateSchema = z.object({
  timer_id: z.string().min(1),
})

const shareDataSchema = z.object({
  sharedAt: z.string(),
  timerId: z.string(),
})

const webhookPublicPatchSchema = z
  .object({
    event_types: WEBHOOK_CREATE_SCHEMA.shape.event_types,
    name: WEBHOOK_CREATE_SCHEMA.shape.name.optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict()
  .refine((data) => data.event_types !== undefined || data.name !== undefined || data.status !== undefined, {
    message: "Provide at least one webhook field to update.",
  })

const webhookTestSchema = z
  .object({
    event_type: webhookEventTypeSchema.optional(),
  })
  .strict()

function validationResponse(error: z.ZodError) {
  return apiError("validation_error", "We found an error with one or more fields in the request.", {
    details: error.issues.map((issue) => ({ message: issue.message, path: issue.path })),
    status: 400,
  })
}

function timerFromCreate(input: z.infer<typeof timerCreateSchema>): Timer {
  const createdAt = nowIso()
  return {
    id: input.id ?? nanoid(10),
    label: input.label,
    targetDate: input.target_date,
    timezone: input.timezone,
    createdAt,
    updatedAt: createdAt,
    color: nonEmptyOrUndefined(input.color),
    description: nonEmptyOrUndefined(input.description),
    image: input.image,
    notify: input.notify ?? true,
    pinned: input.pinned,
    recurrence: input.recurrence,
    spaceId: nonEmptyOrUndefined(input.space_id),
  }
}

function timerFromPatch(timer: Timer, input: z.infer<typeof timerPatchSchema>): Timer {
  const nextArchivedAt = input.archived_at ?? undefined
  const nextColor = nonEmptyOrUndefined(input.color ?? undefined)
  const nextDescription = nonEmptyOrUndefined(input.description)
  const nextSpaceId = nonEmptyOrUndefined(input.space_id ?? undefined)

  return {
    ...timer,
    archivedAt: input.archived_at === undefined ? timer.archivedAt : nextArchivedAt,
    color: input.color === undefined ? timer.color : nextColor,
    description: input.description === undefined ? timer.description : nextDescription,
    image: input.image ?? timer.image,
    label: input.label ?? timer.label,
    notify: input.notify ?? timer.notify,
    pinned: input.pinned ?? timer.pinned,
    recurrence: input.recurrence ?? timer.recurrence,
    spaceId: input.space_id === undefined ? timer.spaceId : nextSpaceId,
    targetDate: input.target_date ?? timer.targetDate,
    timezone: input.timezone ?? timer.timezone,
    updatedAt: nowIso(),
  }
}

function spaceFromCreate(input: z.infer<typeof spaceCreateSchema>): Space {
  return {
    id: input.id ?? nanoid(8),
    name: input.name,
    color: nonEmptyOrUndefined(input.color),
    createdAt: nowIso(),
  }
}

function timerPlanInput(input: z.infer<typeof timerCreateSchema>) {
  return {
    color: nonEmptyOrNull(input.color),
    description: nonEmptyOrNull(input.description),
    id: input.id ?? null,
    image: input.image ?? null,
    label: input.label,
    notify: input.notify ?? true,
    pinned: input.pinned ?? false,
    recurrence: input.recurrence ?? null,
    space_id: nonEmptyOrNull(input.space_id),
    target_date: input.target_date,
    timezone: input.timezone,
  }
}

function nestedTimerPlanInput(input: z.infer<typeof projectNestedTimerCreateSchema>) {
  return timerPlanInput({ ...input, space_id: null })
}

function projectCreatePlanInput(input: z.infer<typeof projectCreateSchema>) {
  return {
    color: nonEmptyOrNull(input.color),
    name: input.name,
    spaces: (input.spaces ?? []).map((space) => ({
      color: nonEmptyOrNull(space.color),
      id: space.id ?? null,
      name: space.name,
      timers: (space.timers ?? []).map(nestedTimerPlanInput),
    })),
    timers: (input.timers ?? []).map(timerPlanInput),
  }
}

function projectCreatePlanHash(input: z.infer<typeof projectCreateSchema>) {
  return `sha256:${sha256Hex(stableJson(projectCreatePlanInput(input)))}`
}

function duplicateValue(values: string[]) {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
  return null
}

function projectSnapshotConsistency(snapshot: ProjectSnapshotV2): Response | null {
  const duplicateSpace = duplicateValue(snapshot.spaces.map((space) => space.id))
  if (duplicateSpace) return apiError("validation_error", `Duplicate space id: ${duplicateSpace}.`, { status: 400 })

  const duplicateTimer = duplicateValue(snapshot.timers.map((timer) => timer.id))
  if (duplicateTimer) return apiError("validation_error", `Duplicate timer id: ${duplicateTimer}.`, { status: 400 })

  const missingSpace = snapshot.timers.find(
    (timer) => timer.spaceId && !snapshot.spaces.some((space) => space.id === timer.spaceId),
  )
  if (missingSpace) return apiError("validation_error", "space_id does not exist in this project.", { status: 400 })

  return assertProjectLimits(snapshot)
}

function projectFromCreate(input: z.infer<typeof projectCreateSchema>) {
  const spaces: Space[] = []
  const timers: Timer[] = []

  for (const spaceInput of input.spaces ?? []) {
    const space = spaceFromCreate(spaceInput)
    spaces.push(space)
    for (const timerInput of spaceInput.timers ?? []) {
      timers.push(timerFromCreate({ ...timerInput, space_id: space.id }))
    }
  }

  for (const timerInput of input.timers ?? []) {
    timers.push(timerFromCreate(timerInput))
  }

  const snapshot = createProjectSnapshot({
    color: nonEmptyOrUndefined(input.color),
    name: input.name,
    spaces,
    timers,
    updatedAt: nowIso(),
  })
  const invalid = projectSnapshotConsistency(snapshot)
  return invalid ?? { snapshot, spaces, timers }
}

function projectCreateWarnings(input: z.infer<typeof projectCreateSchema>) {
  const warnings: Array<{ code: string; message: string; path: string; remediation: string }> = []

  input.timers?.forEach((timer, index) => {
    if (timer.notify === false) return
    warnings.push({
      code: "timer_notify_uses_account_settings",
      message: "notify=true uses account-level notification settings.",
      path: `#/timers/${index}/notify`,
      remediation: "Use notify=true only when account alert settings should decide delivery.",
    })
  })

  input.spaces?.forEach((space, spaceIndex) => {
    space.timers?.forEach((timer, timerIndex) => {
      if (timer.notify === false) return
      warnings.push({
        code: "timer_notify_uses_account_settings",
        message: "notify=true uses account-level notification settings.",
        path: `#/spaces/${spaceIndex}/timers/${timerIndex}/notify`,
        remediation: "Use notify=true only when account alert settings should decide delivery.",
      })
    })
  })

  return warnings
}

function projectCreateChanges(input: z.infer<typeof projectCreateSchema>) {
  return [
    { action: "create" as const, path: "#", type: "project", name: input.name },
    ...(input.spaces ?? []).flatMap((space, spaceIndex) => [
      { action: "create" as const, path: `#/spaces/${spaceIndex}`, type: "space", name: space.name },
      ...(space.timers ?? []).map((timer, timerIndex) => ({
        action: "create" as const,
        label: timer.label,
        parent_path: `#/spaces/${spaceIndex}`,
        path: `#/spaces/${spaceIndex}/timers/${timerIndex}`,
        type: "timer",
      })),
    ]),
    ...(input.timers ?? []).map((timer, timerIndex) => ({
      action: "create" as const,
      label: timer.label,
      path: `#/timers/${timerIndex}`,
      type: "timer",
    })),
  ]
}

function projectCreatePreview(input: z.infer<typeof projectCreateSchema>) {
  const nestedTimerCount = (input.spaces ?? []).reduce((count, space) => count + (space.timers?.length ?? 0), 0)
  const timerCount = (input.timers?.length ?? 0) + nestedTimerCount
  const planHash = projectCreatePlanHash(input)
  return {
    object: "project_preview" as const,
    dry_run: true,
    operation: "create_project" as const,
    plan_hash: planHash,
    summary: {
      projects: { create: 1 },
      spaces: { create: input.spaces?.length ?? 0 },
      timers: { create: timerCount },
    },
    changes: projectCreateChanges(input),
    warnings: projectCreateWarnings(input),
    apply: {
      method: "POST" as const,
      path: "/api/v1/projects",
      requires_idempotency_key: true,
      expected_plan_hash: planHash,
    },
  }
}

function projectCreateResult(project: ProjectRow, spaces: Space[], timers: Timer[]) {
  return {
    ...projectObject(project),
    spaces: spaces.map((space) => spaceObject(project, space)),
    timers: timers.map((timer) => timerObject(project, timer)),
  }
}

function spaceFromPatch(space: Space, input: z.infer<typeof spacePatchSchema>): Space {
  return {
    ...space,
    color: input.color === undefined ? space.color : nonEmptyOrUndefined(input.color),
    name: input.name ?? space.name,
  }
}

function assertTimerCanUseSpace(snapshot: ProjectSnapshotV2, timer: Timer): Response | null {
  if (!timer.spaceId) return null
  if (snapshot.spaces.some((space) => space.id === timer.spaceId)) return null
  return apiError("validation_error", "space_id does not exist in this project.", { status: 400 })
}

function assertProjectLimits(snapshot: ProjectSnapshotV2): Response | null {
  const entitlements = getEntitlements()
  if (snapshot.timers.length > entitlements.maxSnapshotTimers) {
    return apiError("validation_error", `Maximum ${entitlements.maxSnapshotTimers} timers allowed.`, { status: 400 })
  }
  if (snapshot.spaces.length > entitlements.maxSpaces) {
    return apiError("validation_error", `Maximum ${entitlements.maxSpaces} spaces allowed.`, { status: 400 })
  }
  return null
}

async function deleteProjectGraph(tx: Prisma.TransactionClient, projectId: string) {
  const timerIds = (await tx.timer.findMany({ where: { projectId }, select: { id: true } })).map((timer) => timer.id)
  if (timerIds.length > 0) {
    await tx.notificationOutboxItem.deleteMany({ where: { timerId: { in: timerIds } } })
    await tx.notificationDeliveryLog.deleteMany({ where: { timerId: { in: timerIds } } })
  }
  await tx.share.deleteMany({ where: { projectId } })
  await tx.timer.deleteMany({ where: { projectId } })
  await tx.space.deleteMany({ where: { projectId } })
  await tx.projectAccessToken.deleteMany({ where: { projectId } })
  await tx.project.delete({ where: { id: projectId } })
}

function deletePreview(args: {
  applyPath: string
  changes: Array<{
    action: "delete" | "update"
    id: string
    label?: string
    name?: string
    project_id?: string
    project_name?: string
    reason?: string
    type: string
  }>
  operation: "delete_project" | "delete_space"
  summary: Record<string, Record<string, number>>
  target: { id: string; name?: string; project_id?: string; project_name?: string; type: "project" | "space" }
}) {
  return {
    object: "delete_preview" as const,
    dry_run: true,
    operation: args.operation,
    target: args.target,
    would_change: true,
    summary: args.summary,
    changes: args.changes,
    warnings: [],
    apply: {
      method: "DELETE" as const,
      path: args.applyPath,
      requires_idempotency_key: true,
    },
  }
}

function projectEventPayload(project: ProjectRow) {
  return {
    project_id: project.id,
    project_name: project.name,
  }
}

function timerEventPayload(project: ProjectRow, timer: Timer) {
  return {
    project_id: project.id,
    project_name: project.name,
    timer_id: timer.id,
    timer_label: timer.label,
  }
}

async function listProjects(ctx: PublicApiContext, req: Request) {
  const params = listParams(req)
  if (isResponse(params)) return params

  const prisma = requirePrismaClient()
  const cursorId = params.after ?? params.before
  const rows = await prisma.project.findMany({
    cursor: cursorId ? { id: cursorId } : undefined,
    orderBy: { createdAt: params.before ? "asc" : "desc" },
    skip: cursorId ? 1 : 0,
    take: params.limit + 1,
    where: ownedProjectsWhere(ctx.apiKey.user),
  })
  const sliced = rows.slice(0, params.limit)
  const orderedRows = params.before ? sliced.toReversed() : sliced
  const data = orderedRows.map(projectObject)
  return apiJson(apiList(data, rows.length > params.limit))
}

async function createProject(ctx: PublicApiContext, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = projectCreateSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  const expectedPlanHash = parsed.data.expected_plan_hash
  const planHash = projectCreatePlanHash(parsed.data)
  if (expectedPlanHash && expectedPlanHash !== planHash) {
    return apiError("plan_hash_mismatch", "expected_plan_hash does not match the request body.", { status: 409 })
  }

  const planned = projectFromCreate(parsed.data)
  if (isResponse(planned)) return planned

  const prisma = requirePrismaClient()
  if (typeof (prisma as { $transaction?: unknown }).$transaction !== "function") {
    const row = await prisma.project.create({
      data: {
        ...writeProjectFields(planned.snapshot),
        ownerId: ctx.apiKey.user.id,
      },
    })
    return apiJson(projectCreateResult(row, planned.spaces, planned.timers), { status: 201 })
  }

  const row = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        ...writeProjectFields(planned.snapshot),
        ownerId: ctx.apiKey.user.id,
      },
    })

    await emitWebhookEvent(tx, {
      aggregateId: project.id,
      aggregateType: "project",
      payload: projectEventPayload(project),
      projectId: project.id,
      type: "project.created",
      userId: project.ownerId,
    })

    for (const space of planned.spaces) {
      await tx.space.create({ data: spaceRowData(project.id, project.ownerId, space) })
    }
    for (const timer of planned.timers) {
      await tx.timer.create({ data: timerRowData(project.id, project.ownerId, timer) })
      await emitWebhookEvent(tx, {
        aggregateId: timer.id,
        aggregateType: "timer",
        payload: {
          ...timerEventPayload(project, timer),
          target_date: timer.targetDate,
          timezone: timer.timezone,
        },
        projectId: project.id,
        timerId: timer.id,
        type: "timer.created",
        userId: project.ownerId,
      })
      await scheduleTimerEndedEvent(tx, { project, timer })
    }
    return project
  })

  return apiJson(projectCreateResult(row, planned.spaces, planned.timers), { status: 201 })
}

async function previewProjectCreate(req: Request) {
  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = projectCreateSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  const planned = projectFromCreate(parsed.data)
  if (isResponse(planned)) return planned

  return apiJson(projectCreatePreview(parsed.data))
}

async function getProject(ctx: PublicApiContext, projectId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  return apiJson(projectObject(row))
}

async function updateProject(ctx: PublicApiContext, projectId: string, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = projectUpdateSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const next = changedSnapshot(snapshot, {
      color: parsed.data.color === undefined ? snapshot.color : nonEmptyOrUndefined(parsed.data.color ?? undefined),
      name: parsed.data.name ?? snapshot.name,
    })

    const updated = await tx.project.update({
      where: { id: projectId },
      data: writeProjectFields(next),
    })
    await emitWebhookEvent(tx, {
      aggregateId: projectId,
      aggregateType: "project",
      payload: {
        ...projectEventPayload(updated),
        previous_name: row.name,
      },
      projectId,
      type: "project.updated",
      userId: updated.ownerId,
    })
    return projectObject(updated)
  })

  return isResponse(result) ? result : apiJson(result)
}

async function previewDeleteProject(ctx: PublicApiContext, projectId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const snapshot = requireSnapshot(row)
  if (isResponse(snapshot)) return snapshot

  const shareCount = await requirePrismaClient().share.count({ where: { projectId } })
  return apiJson(
    deletePreview({
      applyPath: `/api/v1/projects/${projectId}`,
      changes: [
        { action: "delete", id: projectId, name: row.name, type: "project" },
        ...snapshot.spaces.map((space) => ({
          action: "delete" as const,
          id: space.id,
          name: space.name,
          reason: "cascade",
          type: "space",
        })),
        ...snapshot.timers.map((timer) => ({
          action: "delete" as const,
          id: timer.id,
          label: timer.label,
          reason: "cascade",
          type: "timer",
        })),
      ],
      operation: "delete_project",
      summary: {
        projects: { delete: 1 },
        share_links: { delete: shareCount },
        spaces: { delete: snapshot.spaces.length },
        timers: { delete: snapshot.timers.length },
      },
      target: { id: projectId, name: row.name, type: "project" },
    }),
  )
}

async function deleteProject(ctx: PublicApiContext, projectId: string, req: Request) {
  if (isDryRunRequest(req)) return previewDeleteProject(ctx, projectId)

  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    await (tx as { webhookEvent?: { updateMany?: (args: unknown) => Promise<unknown> } }).webhookEvent?.updateMany?.({
      data: { cancelledAt: new Date(), status: "cancelled" },
      where: { projectId, status: "pending", userId: row.ownerId ?? undefined },
    })
    await emitWebhookEvent(tx, {
      aggregateId: projectId,
      aggregateType: "project",
      payload: projectEventPayload(row),
      projectId,
      type: "project.deleted",
      userId: row.ownerId,
    })
    await deleteProjectGraph(tx, projectId)
    return { object: "project" as const, id: projectId, name: row.name, deleted: true }
  })

  return isResponse(result) ? result : apiJson(result)
}

async function listTimers(ctx: PublicApiContext, projectId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const snapshot = requireSnapshot(row)
  if (isResponse(snapshot)) return snapshot
  return apiJson(apiList(snapshot.timers.map((timer) => timerObject(row, timer))))
}

async function createTimer(ctx: PublicApiContext, projectId: string, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = timerCreateSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const timer = timerFromCreate(parsed.data)
    if (snapshot.timers.some((existing) => existing.id === timer.id)) {
      return apiError("validation_error", "Timer id already exists.", { status: 400 })
    }
    const invalidSpace = assertTimerCanUseSpace(snapshot, timer)
    if (invalidSpace) return invalidSpace

    const next = changedSnapshot(snapshot, { timers: [...snapshot.timers, timer] })
    const limits = assertProjectLimits(next)
    if (limits) return limits

    await tx.timer.create({ data: timerRowData(projectId, row.ownerId, timer) })
    await tx.project.update({ where: { id: projectId }, data: writeProjectFields(next) })
    await emitWebhookEvent(tx, {
      aggregateId: timer.id,
      aggregateType: "timer",
      payload: {
        ...timerEventPayload(row, timer),
        target_date: timer.targetDate,
        timezone: timer.timezone,
      },
      projectId,
      timerId: timer.id,
      type: "timer.created",
      userId: row.ownerId,
    })
    await scheduleTimerEndedEvent(tx, { project: row, timer })
    return timerObject(row, timer)
  })

  return isResponse(result) ? result : apiJson(result, { status: 201 })
}

async function getTimer(ctx: PublicApiContext, projectId: string, timerId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const snapshot = requireSnapshot(row)
  if (isResponse(snapshot)) return snapshot

  const timer = snapshot.timers.find((item) => item.id === timerId)
  if (!timer) return apiError("not_found", "Timer not found.", { status: 404 })
  return apiJson(timerObject(row, timer))
}

async function updateTimer(ctx: PublicApiContext, projectId: string, timerId: string, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = timerPatchSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const index = snapshot.timers.findIndex((timer) => timer.id === timerId)
    if (index === -1) return apiError("not_found", "Timer not found.", { status: 404 })

    const previousTimer = snapshot.timers[index]
    const timer = timerFromPatch(previousTimer, parsed.data)
    const invalidSpace = assertTimerCanUseSpace(snapshot, timer)
    if (invalidSpace) return invalidSpace

    const timers = [...snapshot.timers]
    timers[index] = timer
    const next = changedSnapshot(snapshot, { timers })

    const updatedTimer = await tx.timer.updateMany({
      where: { id: timerId, projectId },
      data: {
        archivedAt: timer.archivedAt ? new Date(timer.archivedAt) : null,
        data: jsonInput(timer),
        updatedAt: new Date(timer.updatedAt ?? next.updatedAt),
      },
    })
    if (updatedTimer.count !== 1) {
      return apiError("storage_unavailable", "Timer row is unavailable.", { status: 503 })
    }
    await tx.project.update({ where: { id: projectId }, data: writeProjectFields(next) })
    let type: WebhookEventType = "timer.updated"
    if (!previousTimer.archivedAt && timer.archivedAt) type = "timer.archived"
    else if (previousTimer.archivedAt && !timer.archivedAt) type = "timer.restored"
    await emitWebhookEvent(tx, {
      aggregateId: timer.id,
      aggregateType: "timer",
      payload: {
        ...timerEventPayload(row, timer),
        target_date: timer.targetDate,
        timezone: timer.timezone,
      },
      projectId,
      timerId: timer.id,
      type,
      userId: row.ownerId,
    })
    await scheduleTimerEndedEvent(tx, { project: row, timer })
    return timerObject(row, timer)
  })

  return isResponse(result) ? result : apiJson(result)
}

async function deleteTimer(ctx: PublicApiContext, projectId: string, timerId: string) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const timer = snapshot.timers.find((item) => item.id === timerId)
    if (!timer) {
      return apiError("not_found", "Timer not found.", { status: 404 })
    }

    const next = changedSnapshot(snapshot, { timers: snapshot.timers.filter((timer) => timer.id !== timerId) })
    await cancelPendingTimerEndedEvents(tx, { projectId, timerId, userId: row.ownerId })
    await tx.notificationOutboxItem.deleteMany({ where: { timerId } })
    await tx.notificationDeliveryLog.deleteMany({ where: { timerId } })
    await tx.share.deleteMany({ where: { projectId, kind: "timer", data: { path: ["timerId"], equals: timerId } } })
    const deletedTimer = await tx.timer.deleteMany({ where: { id: timerId, projectId } })
    if (deletedTimer.count !== 1) {
      return apiError("storage_unavailable", "Timer row is unavailable.", { status: 503 })
    }
    await tx.project.update({ where: { id: projectId }, data: writeProjectFields(next) })
    await emitWebhookEvent(tx, {
      aggregateId: timerId,
      aggregateType: "timer",
      payload: timerEventPayload(row, timer),
      projectId,
      timerId,
      type: "timer.deleted",
      userId: row.ownerId,
    })
    return {
      object: "timer" as const,
      id: timerId,
      project_id: projectId,
      project_name: row.name,
      label: timer.label,
      deleted: true,
    }
  })

  return isResponse(result) ? result : apiJson(result)
}

async function listSpaces(ctx: PublicApiContext, projectId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const snapshot = requireSnapshot(row)
  if (isResponse(snapshot)) return snapshot
  return apiJson(apiList(snapshot.spaces.map((space) => spaceObject(row, space))))
}

async function createSpace(ctx: PublicApiContext, projectId: string, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = spaceCreateSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const space = spaceFromCreate(parsed.data)
    if (snapshot.spaces.some((existing) => existing.id === space.id)) {
      return apiError("validation_error", "Space id already exists.", { status: 400 })
    }

    const next = changedSnapshot(snapshot, { spaces: [...snapshot.spaces, space] })
    const limits = assertProjectLimits(next)
    if (limits) return limits

    await tx.space.create({ data: spaceRowData(projectId, row.ownerId, space) })
    await tx.project.update({ where: { id: projectId }, data: writeProjectFields(next) })
    return spaceObject(row, space)
  })

  return isResponse(result) ? result : apiJson(result, { status: 201 })
}

async function getSpace(ctx: PublicApiContext, projectId: string, spaceId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const snapshot = requireSnapshot(row)
  if (isResponse(snapshot)) return snapshot

  const space = snapshot.spaces.find((item) => item.id === spaceId)
  if (!space) return apiError("not_found", "Space not found.", { status: 404 })
  return apiJson(spaceObject(row, space))
}

async function updateSpace(ctx: PublicApiContext, projectId: string, spaceId: string, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = spacePatchSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const index = snapshot.spaces.findIndex((space) => space.id === spaceId)
    if (index === -1) return apiError("not_found", "Space not found.", { status: 404 })

    const space = spaceFromPatch(snapshot.spaces[index], parsed.data)
    const spaces = [...snapshot.spaces]
    spaces[index] = space
    const next = changedSnapshot(snapshot, { spaces })

    const updatedSpace = await tx.space.updateMany({
      where: { id: spaceId, projectId },
      data: { data: jsonInput(space), updatedAt: new Date(next.updatedAt) },
    })
    if (updatedSpace.count !== 1) {
      return apiError("storage_unavailable", "Space row is unavailable.", { status: 503 })
    }
    await tx.project.update({ where: { id: projectId }, data: writeProjectFields(next) })
    return spaceObject(row, space)
  })

  return isResponse(result) ? result : apiJson(result)
}

async function previewDeleteSpace(ctx: PublicApiContext, projectId: string, spaceId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const snapshot = requireSnapshot(row)
  if (isResponse(snapshot)) return snapshot

  const space = snapshot.spaces.find((item) => item.id === spaceId)
  if (!space) {
    return apiError("not_found", "Space not found.", { status: 404 })
  }

  const affectedTimers = snapshot.timers.filter((timer) => timer.spaceId === spaceId)
  return apiJson(
    deletePreview({
      applyPath: `/api/v1/projects/${projectId}/spaces/${spaceId}`,
      changes: [
        {
          action: "delete",
          id: spaceId,
          name: space.name,
          project_id: projectId,
          project_name: row.name,
          type: "space",
        },
        ...affectedTimers.map((timer) => ({
          action: "update" as const,
          id: timer.id,
          label: timer.label,
          project_id: projectId,
          project_name: row.name,
          reason: "space_removed",
          type: "timer",
        })),
      ],
      operation: "delete_space",
      summary: {
        share_links: { delete: 0 },
        spaces: { delete: 1 },
        timers: { update: affectedTimers.length },
      },
      target: { id: spaceId, name: space.name, project_id: projectId, project_name: row.name, type: "space" },
    }),
  )
}

async function deleteSpace(ctx: PublicApiContext, projectId: string, spaceId: string, req: Request) {
  if (isDryRunRequest(req)) return previewDeleteSpace(ctx, projectId, spaceId)

  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const space = snapshot.spaces.find((item) => item.id === spaceId)
    if (!space) {
      return apiError("not_found", "Space not found.", { status: 404 })
    }

    const timers = snapshot.timers.map((timer) =>
      timer.spaceId === spaceId ? { ...timer, spaceId: undefined, updatedAt: nowIso() } : timer,
    )
    const next = changedSnapshot(snapshot, {
      spaces: snapshot.spaces.filter((space) => space.id !== spaceId),
      timers,
    })
    const changedTimers = timers.filter((timer, index) => timer !== snapshot.timers[index])

    const deletedSpace = await tx.space.deleteMany({ where: { id: spaceId, projectId } })
    if (deletedSpace.count !== 1) {
      return apiError("storage_unavailable", "Space row is unavailable.", { status: 503 })
    }
    for (const timer of changedTimers) {
      const updatedTimer = await tx.timer.updateMany({
        where: { id: timer.id, projectId },
        data: { data: jsonInput(timer), updatedAt: new Date(timer.updatedAt ?? next.updatedAt) },
      })
      if (updatedTimer.count !== 1) {
        return apiError("storage_unavailable", "Timer row is unavailable.", { status: 503 })
      }
    }
    await tx.project.update({ where: { id: projectId }, data: writeProjectFields(next) })
    return {
      object: "space" as const,
      id: spaceId,
      project_id: projectId,
      project_name: row.name,
      name: space.name,
      deleted: true,
    }
  })

  return isResponse(result) ? result : apiJson(result)
}

async function listShares(ctx: PublicApiContext, projectId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const shares = await requirePrismaClient().share.findMany({
    where: { projectId, kind: "timer" },
    orderBy: { updatedAt: "desc" },
  })
  return apiJson(apiList(shares.map((share) => shareObject(row, share))))
}

async function createShare(ctx: PublicApiContext, projectId: string, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = shareCreateSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const timerIndex = snapshot.timers.findIndex((item) => item.id === parsed.data.timer_id)
    if (timerIndex === -1) return apiError("not_found", "Timer not found.", { status: 404 })

    const timer = snapshot.timers[timerIndex]
    const actor = { kind: "user" as const, user: ctx.apiKey.user }
    const shareId = stableShareId({ actor, entityId: timer.id, kind: "timer" })
    const existingShare = await tx.share.findUnique({ where: { id: shareId } })
    const isNewShare = !existingShare
    if (existingShare && existingShare.projectId !== projectId) {
      return apiError("storage_unavailable", "Share row belongs to a different project.", { status: 503 })
    }
    const existingData = shareDataSchema.safeParse(existingShare?.data)
    const sharedAt = existingData.success ? existingData.data.sharedAt : nowIso()
    const updatedTimer = { ...timer, sharedAt, updatedAt: nowIso() }
    const timers = [...snapshot.timers]
    timers[timerIndex] = updatedTimer
    const next = changedSnapshot(snapshot, { timers })

    const share = await tx.share.upsert({
      where: { id: shareId },
      update: {
        data: jsonInput({ sharedAt, timerId: timer.id }),
        kind: "timer",
        ownerId: row.ownerId,
        projectId,
      },
      create: {
        id: shareId,
        data: jsonInput({ sharedAt, timerId: timer.id }),
        kind: "timer",
        ownerId: row.ownerId,
        projectId,
      },
    })
    const updatedTimerRow = await tx.timer.updateMany({
      where: { id: timer.id, projectId },
      data: { data: jsonInput(updatedTimer), updatedAt: new Date(updatedTimer.updatedAt) },
    })
    if (updatedTimerRow.count !== 1) {
      return apiError("storage_unavailable", "Timer row is unavailable.", { status: 503 })
    }
    await tx.project.update({ where: { id: projectId }, data: writeProjectFields(next) })
    if (isNewShare) {
      await emitWebhookEvent(tx, {
        aggregateId: share.id,
        aggregateType: "share",
        payload: {
          ...timerEventPayload(row, updatedTimer),
          share_id: share.id,
        },
        projectId,
        shareId: share.id,
        timerId: timer.id,
        type: "share.created",
        userId: row.ownerId,
      })
    }
    return shareObject(row, share, updatedTimer)
  })

  return isResponse(result) ? result : apiJson(result, { status: 201 })
}

async function getShare(ctx: PublicApiContext, projectId: string, shareId: string) {
  const row = await projectForUser(projectId, ctx.apiKey.user)
  if (!row) return apiError("not_found", "Project not found.", { status: 404 })
  const share = await requirePrismaClient().share.findFirst({ where: { id: shareId, projectId, kind: "timer" } })
  if (!share) return apiError("not_found", "Share not found.", { status: 404 })
  return apiJson(shareObject(row, share))
}

async function deleteShare(ctx: PublicApiContext, projectId: string, shareId: string) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const prisma = requirePrismaClient()
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockedProjectForUser(tx, projectId, ctx.apiKey.user)
    if (!row) return apiError("not_found", "Project not found.", { status: 404 })
    const snapshot = requireSnapshot(row)
    if (isResponse(snapshot)) return snapshot

    const share = await tx.share.findFirst({ where: { id: shareId, projectId, kind: "timer" } })
    if (!share) return apiError("not_found", "Share not found.", { status: 404 })
    const deletedShareResponse = { ...shareObject(row, share), deleted: true }

    const shareData = shareDataSchema.safeParse(share.data)
    const timerId = shareData.success ? shareData.data.timerId : null
    const timer = timerId ? snapshot.timers.find((timer) => timer.id === timerId) : null
    const deletedShare = await tx.share.deleteMany({ where: { id: share.id, projectId, kind: "timer" } })
    if (deletedShare.count !== 1) {
      return apiError("storage_unavailable", "Share row is unavailable.", { status: 503 })
    }
    await emitWebhookEvent(tx, {
      aggregateId: share.id,
      aggregateType: "share",
      payload: {
        project_id: projectId,
        project_name: row.name,
        share_id: share.id,
        timer_id: timerId ?? undefined,
        timer_label: timer?.label,
      },
      projectId,
      shareId: share.id,
      timerId,
      type: "share.deleted",
      userId: row.ownerId,
    })

    if (!timerId) return deletedShareResponse

    const timerIndex = snapshot.timers.findIndex((timer) => timer.id === timerId)
    if (timerIndex === -1) return deletedShareResponse

    const updatedTimer = { ...snapshot.timers[timerIndex], sharedAt: undefined, updatedAt: nowIso() }
    const timers = [...snapshot.timers]
    timers[timerIndex] = updatedTimer
    const next = changedSnapshot(snapshot, { timers })

    const updatedTimerRow = await tx.timer.updateMany({
      where: { id: timerId, projectId },
      data: { data: jsonInput(updatedTimer), updatedAt: new Date(updatedTimer.updatedAt) },
    })
    if (updatedTimerRow.count !== 1) {
      return apiError("storage_unavailable", "Timer row is unavailable.", { status: 503 })
    }
    await tx.project.update({ where: { id: projectId }, data: writeProjectFields(next) })
    return deletedShareResponse
  })

  return isResponse(result) ? result : apiJson(result)
}

function webhookMutationError(operation: string, error: unknown) {
  if (error instanceof WebhookUrlSecurityError) {
    return apiError("validation_error", error.message, { status: 400 })
  }
  if (error instanceof WebhookEndpointLimitError) {
    return apiError("limit_exceeded", error.message, { status: 409 })
  }
  console.error(`[tickward] public_api.webhooks.${operation}`, error)
  return apiError("storage_unavailable", "Webhook storage is unavailable.", { status: 503 })
}

function webhookDeliveryListLimit(req: Request) {
  const rawLimit = new URL(req.url).searchParams.get("limit")
  const parsedLimit = rawLimit ? Number(rawLimit) : 10
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return apiError("validation_error", "limit must be an integer between 1 and 100.", { status: 400 })
  }
  return parsedLimit
}

async function readOptionalJson(req: Request) {
  const text = await req.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return apiError("validation_error", "Request body must be valid JSON.", { status: 400 })
  }
}

async function enforceWebhookTestRateLimit(userId: string, webhookId: string) {
  try {
    const rateLimit = await checkRateLimit("webhook-test", `user:${userId}:webhook:${webhookId}`)
    if (rateLimit.allowed) return null
    return apiError("rate_limited", "Too many test webhook requests.", { headers: rateLimit.headers, status: 429 })
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }
}

async function findWebhookEndpointForApi(ctx: PublicApiContext, webhookId: string) {
  return (await listWebhookEndpointsForUser(ctx.apiKey.user)).find((record) => record.id === webhookId) ?? null
}

async function getWebhookEndpointForApi(ctx: PublicApiContext, webhookId: string) {
  const endpoint = await findWebhookEndpointForApi(ctx, webhookId)
  if (!endpoint) return apiError("not_found", "Webhook endpoint not found.", { status: 404 })
  return apiJson(endpoint)
}

async function listWebhookEndpoints(ctx: PublicApiContext) {
  return apiJson(apiList(await listWebhookEndpointsForUser(ctx.apiKey.user)))
}

async function createWebhookEndpoint(ctx: PublicApiContext, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = WEBHOOK_CREATE_SCHEMA.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  try {
    const created = await createWebhookEndpointForUser({
      eventTypes: parsed.data.event_types,
      name: parsed.data.name,
      url: parsed.data.url,
      user: ctx.apiKey.user,
    })
    return apiJson(created, { status: 201 })
  } catch (error) {
    return webhookMutationError("create", error)
  }
}

async function updateWebhookEndpoint(ctx: PublicApiContext, webhookId: string, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = webhookPublicPatchSchema.safeParse(body)
  if (!parsed.success) return validationResponse(parsed.error)

  try {
    const updated = await updateWebhookEndpointForUser({
      eventTypes: parsed.data.event_types,
      id: webhookId,
      name: parsed.data.name,
      status: parsed.data.status,
      user: ctx.apiKey.user,
    })
    if (!updated) return apiError("not_found", "Webhook endpoint not found.", { status: 404 })
    return apiJson(updated)
  } catch (error) {
    return webhookMutationError("update", error)
  }
}

async function removeWebhookEndpoint(ctx: PublicApiContext, webhookId: string) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  try {
    const removed = await removeWebhookEndpointForUser({ id: webhookId, user: ctx.apiKey.user })
    if (!removed) return apiError("not_found", "Webhook endpoint not found.", { status: 404 })
    return apiJson({ deleted: true, id: webhookId, object: "webhook_endpoint" })
  } catch (error) {
    return webhookMutationError("remove", error)
  }
}

async function sendTestWebhook(ctx: PublicApiContext, webhookId: string, req: Request) {
  const denied = validateProjectWriteAccess(ctx)
  if (denied) return denied

  const rateLimit = await enforceWebhookTestRateLimit(ctx.apiKey.user.id, webhookId)
  if (rateLimit) return rateLimit

  const body = await readOptionalJson(req)
  if (isResponse(body)) return body

  const parsed = webhookTestSchema.safeParse(body ?? {})
  if (!parsed.success) return validationResponse(parsed.error)

  try {
    const result = await sendTestWebhookForUser({
      eventType: parsed.data.event_type,
      id: webhookId,
      user: ctx.apiKey.user,
    })
    if (!result) return apiError("not_found", "Webhook endpoint not found.", { status: 404 })
    return apiJson(result)
  } catch (error) {
    return webhookMutationError("test", error)
  }
}

async function listWebhookDeliveries(ctx: PublicApiContext, webhookId: string, req: Request) {
  const limit = webhookDeliveryListLimit(req)
  if (isResponse(limit)) return limit

  try {
    const endpoint = await findWebhookEndpointForApi(ctx, webhookId)
    if (!endpoint) return apiError("not_found", "Webhook endpoint not found.", { status: 404 })
    const deliveries = await listRecentWebhookDeliveriesForUser(ctx.apiKey.user, { endpointId: webhookId, limit })
    return apiJson(apiList(deliveries))
  } catch (error) {
    console.error("[tickward] public_api.webhooks.deliveries", error)
    return apiError("storage_unavailable", "Webhook storage is unavailable.", { status: 503 })
  }
}

async function authenticate(req: Request): Promise<{ ctx: PublicApiContext; headers: HeadersInit } | Response> {
  try {
    const ipRateLimit = await checkRateLimit("public-api-ip", `ip:${clientIp(req)}`)
    if (!ipRateLimit.allowed) {
      return apiError("rate_limited", "Too many requests.", { headers: ipRateLimit.headers, status: 429 })
    }
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }

  const token = readBearerApiKey(req)
  if (!token) {
    return apiError("missing_api_key", "Missing bearer credential in the authorization header.", { status: 401 })
  }

  const apiKey = await authenticateApiKey(token)
  if (!apiKey) {
    return apiError("invalid_api_key", "API key is invalid.", { status: 403 })
  }

  try {
    const rateLimit = await checkRateLimit("public-api", apiKey.rateLimitKey)
    if (!rateLimit.allowed) {
      return apiError("rate_limited", "Too many requests.", { headers: rateLimit.headers, status: 429 })
    }
    return { ctx: { apiKey }, headers: rateLimit.headers }
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }
}

function shouldTrustProxyHeaders() {
  return process.env.TICKWARD_TRUST_PROXY_HEADERS === "true" || process.env.TRUST_PROXY_HEADERS === "true"
}

function clientIp(req: Request) {
  if (!shouldTrustProxyHeaders()) return "unknown"

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwardedFor) return forwardedFor
  return req.headers.get("x-real-ip")?.trim() ?? "unknown"
}

function withHeaders(response: Response, headers: HeadersInit) {
  const next = new Response(response.body, response)
  for (const [key, value] of new Headers(headers)) next.headers.set(key, value)
  return next
}

async function withPublicApiMetadata(response: Response, meta: PublicApiRequestMetadata) {
  const headers = publicApiMetadataHeaders(meta)
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) return withHeaders(response, headers)

  try {
    const data = await response.clone().json()
    if (!isPublicApiErrorBody(data)) return withHeaders(response, headers)

    const next = new Response(JSON.stringify(augmentPublicApiErrorBody(data, meta)), response)
    next.headers.set("content-type", "application/json")
    return withHeaders(next, headers)
  } catch {
    return withHeaders(response, headers)
  }
}

function methodNotAllowed() {
  return apiError("method_not_allowed", "Method is not allowed for the requested path.", { status: 405 })
}

function routeProjectPreview(method: string, req: Request) {
  if (method === "POST") return previewProjectCreate(req)
  return methodNotAllowed()
}

function routeProjectsCollection(method: string, ctx: PublicApiContext, req: Request) {
  if (method === "GET") return listProjects(ctx, req)
  if (method === "POST") return createProject(ctx, req)
  return methodNotAllowed()
}

function routeProjectResource(method: string, ctx: PublicApiContext, projectId: string, req: Request) {
  if (method === "GET") return getProject(ctx, projectId)
  if (method === "PATCH") return updateProject(ctx, projectId, req)
  if (method === "DELETE") return deleteProject(ctx, projectId, req)
  return methodNotAllowed()
}

function routeProjectChildCollection(
  method: string,
  ctx: PublicApiContext,
  projectId: string,
  child: string,
  req: Request,
) {
  if (child === "timers") {
    if (method === "GET") return listTimers(ctx, projectId)
    if (method === "POST") return createTimer(ctx, projectId, req)
    return methodNotAllowed()
  }

  if (child === "spaces") {
    if (method === "GET") return listSpaces(ctx, projectId)
    if (method === "POST") return createSpace(ctx, projectId, req)
    return methodNotAllowed()
  }

  if (child === "shares") {
    if (method === "GET") return listShares(ctx, projectId)
    if (method === "POST") return createShare(ctx, projectId, req)
    return methodNotAllowed()
  }

  return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
}

function routeTimerResource(method: string, ctx: PublicApiContext, projectId: string, timerId: string, req: Request) {
  if (method === "GET") return getTimer(ctx, projectId, timerId)
  if (method === "PATCH") return updateTimer(ctx, projectId, timerId, req)
  if (method === "DELETE") return deleteTimer(ctx, projectId, timerId)
  return methodNotAllowed()
}

function routeSpaceResource(method: string, ctx: PublicApiContext, projectId: string, spaceId: string, req: Request) {
  if (method === "GET") return getSpace(ctx, projectId, spaceId)
  if (method === "PATCH") return updateSpace(ctx, projectId, spaceId, req)
  if (method === "DELETE") return deleteSpace(ctx, projectId, spaceId, req)
  return methodNotAllowed()
}

function routeShareResource(method: string, ctx: PublicApiContext, projectId: string, shareId: string) {
  if (method === "GET") return getShare(ctx, projectId, shareId)
  if (method === "DELETE") return deleteShare(ctx, projectId, shareId)
  return methodNotAllowed()
}

function routeWebhooksCollection(method: string, ctx: PublicApiContext, req: Request) {
  if (method === "GET") return listWebhookEndpoints(ctx)
  if (method === "POST") return createWebhookEndpoint(ctx, req)
  return methodNotAllowed()
}

function routeWebhookResource(method: string, ctx: PublicApiContext, webhookId: string, req: Request) {
  if (method === "GET") return getWebhookEndpointForApi(ctx, webhookId)
  if (method === "PATCH") return updateWebhookEndpoint(ctx, webhookId, req)
  if (method === "DELETE") return removeWebhookEndpoint(ctx, webhookId)
  return methodNotAllowed()
}

function routeWebhookChild(method: string, ctx: PublicApiContext, webhookId: string, child: string, req: Request) {
  if (child === "test") {
    if (method === "POST") return sendTestWebhook(ctx, webhookId, req)
    return methodNotAllowed()
  }
  if (child === "deliveries") {
    if (method === "GET") return listWebhookDeliveries(ctx, webhookId, req)
    return methodNotAllowed()
  }
  return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
}

function routeProjectChildResource(
  method: string,
  ctx: PublicApiContext,
  projectId: string,
  child: string,
  childId: string,
  req: Request,
) {
  if (child === "timers") return routeTimerResource(method, ctx, projectId, childId, req)
  if (child === "spaces") return routeSpaceResource(method, ctx, projectId, childId, req)
  if (child === "shares") return routeShareResource(method, ctx, projectId, childId)

  return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
}

function routePublicApi(method: string, ctx: PublicApiContext, req: Request, path: string[]) {
  const [resource, projectId, child, childId] = path
  if (resource === "webhooks") {
    if (path.length === 1) return routeWebhooksCollection(method, ctx, req)
    if (!projectId) return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
    if (path.length === 2) return routeWebhookResource(method, ctx, projectId, req)
    if (path.length === 3 && child) return routeWebhookChild(method, ctx, projectId, child, req)
    return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
  }
  if (resource !== "projects") return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
  if (projectId === "preview" && path.length === 2) return routeProjectPreview(method, req)
  if (path.length === 1) return routeProjectsCollection(method, ctx, req)
  if (!projectId) return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
  if (path.length === 2) return routeProjectResource(method, ctx, projectId, req)
  if (!child) return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
  if (path.length === 3) return routeProjectChildCollection(method, ctx, projectId, child, req)
  if (path.length === 4 && childId) return routeProjectChildResource(method, ctx, projectId, child, childId, req)
  return apiError("not_found", "The requested endpoint does not exist.", { status: 404 })
}

async function routePublicApiWithIdempotency(method: string, ctx: PublicApiContext, req: Request, path: string[]) {
  if (!isMutatingMethod(method)) return routePublicApi(method, ctx, req, path)
  if (method === "POST" && path.length === 2 && path[0] === "projects" && path[1] === "preview") {
    return routePublicApi(method, ctx, req, path)
  }
  if (method === "DELETE" && isDryRunRequest(req)) return routePublicApi(method, ctx, req, path)

  const key = idempotencyKeyFromRequest(req)
  if (key === null) return routePublicApi(method, ctx, req, path)
  if (isResponse(key)) return key

  const started = await startIdempotentRequest(ctx, method, req, key)
  if (isResponse(started)) return started

  try {
    const response = await routePublicApi(method, ctx, req, path)
    return await completeIdempotentRequest({ ...started, response })
  } catch (error) {
    await Promise.resolve(started.delegate.delete({ where: { id: started.row.id } })).catch(() => undefined)
    throw error
  }
}

export async function handlePublicApiV1Request(method: string, req: Request, path: string[] = []) {
  const meta = publicApiRequestMetadata(req)
  if (method === "GET" && path.length === 1 && path[0] === "capabilities") {
    return withPublicApiMetadata(publicApiCapabilities(), meta)
  }

  const auth = await authenticate(req)
  if (isResponse(auth)) return withPublicApiMetadata(auth, meta)

  try {
    const scopeError = authorizeMcpScope(auth.ctx, method, path)
    if (scopeError) return withPublicApiMetadata(withHeaders(scopeError, auth.headers), meta)

    const response = await routePublicApiWithIdempotency(method, auth.ctx, req, path)
    return withPublicApiMetadata(withHeaders(response, auth.headers), meta)
  } catch (error) {
    if (error instanceof Error && error.name === "PublicApiIdempotencyStorageUnavailableError") {
      return withPublicApiMetadata(
        apiError("storage_unavailable", "Idempotency storage is not available.", { status: 503 }),
        meta,
      )
    }
    if (error instanceof Error && error.name === "ServerPersistenceUnavailableError") {
      return withPublicApiMetadata(
        apiError("storage_unavailable", "Cloud storage is not available.", { status: 503 }),
        meta,
      )
    }
    throw error
  }
}

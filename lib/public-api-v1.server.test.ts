import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeProjectSnapshot, makeSpace, makeTimer } from "@/test/factories"

const mocks = vi.hoisted(() => ({
  authenticateApiKey: vi.fn(),
  checkRateLimit: vi.fn(),
  requirePrismaClient: vi.fn(),
  sendTestWebhookForUser: vi.fn(),
}))

vi.mock("@/lib/api-keys.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-keys.server")>()),
  authenticateApiKey: mocks.authenticateApiKey,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

vi.mock("@/lib/webhooks.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webhooks.server")>()),
  sendTestWebhookForUser: mocks.sendTestWebhookForUser,
}))

const readKey = {
  id: "key_read",
  permission: "read" as const,
  rateLimitKey: "user:user_123",
  user: { id: "user_123", email: "ada@example.com", role: "user" as const },
}

const fullKey = {
  ...readKey,
  id: "key_full",
  permission: "full_access" as const,
}

function webhookEndpointRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh_123",
    name: "Production",
    secret: "whsec_test",
    url: "https://example.com/tickward",
    eventTypes: ["timer.ended"],
    status: "active",
    failureCount: 0,
    createdAt: new Date("2026-06-09T09:00:00.000Z"),
    updatedAt: new Date("2026-06-09T09:00:00.000Z"),
    disabledAt: null,
    lastDeliveredAt: null,
    lastFailedAt: null,
    ...overrides,
  }
}

function webhookDeliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wd_123",
    endpointId: "wh_123",
    eventId: "evt_123",
    status: "delivered",
    attemptCount: 1,
    nextAttemptAt: new Date("2026-06-10T09:00:00.000Z"),
    lastAttemptAt: new Date("2026-06-10T09:00:00.000Z"),
    deliveredAt: new Date("2026-06-10T09:00:00.000Z"),
    failedAt: null,
    responseStatus: 200,
    error: null,
    createdAt: new Date("2026-06-10T08:59:00.000Z"),
    updatedAt: new Date("2026-06-10T09:00:00.000Z"),
    ...overrides,
  }
}

function publicWebhookEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh_123",
    object: "webhook_endpoint",
    name: "Production",
    url: "http://localhost/webhook",
    event_types: ["timer.ended"],
    status: "active",
    failure_count: 0,
    created_at: "2026-06-09T09:00:00.000Z",
    updated_at: "2026-06-09T09:00:00.000Z",
    disabled_at: null,
    last_delivered_at: null,
    last_failed_at: null,
    ...overrides,
  }
}

function publicWebhookDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "wd_123",
    object: "webhook_delivery",
    endpoint_id: "wh_123",
    event_id: "evt_123",
    status: "delivered",
    attempt_count: 1,
    next_attempt_at: null,
    last_attempt_at: "2026-06-10T09:00:00.000Z",
    delivered_at: "2026-06-10T09:00:00.000Z",
    failed_at: null,
    response_status: 200,
    error: null,
    created_at: "2026-06-10T08:59:00.000Z",
    updated_at: "2026-06-10T09:00:00.000Z",
    ...overrides,
  }
}

function projectRow(snapshot = makeProjectSnapshot(), overrides: Record<string, unknown> = {}) {
  return {
    id: "project_123",
    ownerId: "user_123",
    name: snapshot.name,
    color: snapshot.color ?? null,
    snapshot,
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt: new Date(snapshot.updatedAt),
    claimedAt: null,
    ...overrides,
  }
}

function publicApiRequest(method: string, path: string, body?: unknown) {
  return new Request(`https://tickward.test/api/v1${path}`, {
    method,
    headers: { authorization: "Bearer tw_full", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function mockTransaction<T extends object>(tx: T) {
  const transaction = vi.fn(async (callback: (client: T) => unknown | Promise<unknown>) => callback(tx))
  mocks.requirePrismaClient.mockReturnValue({ $transaction: transaction })
  return transaction
}

function idempotencyCacheKey(data: { apiKeyId: string; keyHash: string }) {
  return `${data.apiKeyId}:${data.keyHash}`
}

function idempotencyWhereKey(where: { apiKeyId_keyHash: { apiKeyId: string; keyHash: string } }) {
  return `${where.apiKeyId_keyHash.apiKeyId}:${where.apiKeyId_keyHash.keyHash}`
}

describe("public API v1", () => {
  beforeEach(() => {
    delete process.env.TICKWARD_MCP_REMOTE_URL
    delete process.env.TICKWARD_TRUST_PROXY_HEADERS
    delete process.env.TRUST_PROXY_HEADERS
    mocks.authenticateApiKey.mockReset()
    mocks.authenticateApiKey.mockResolvedValue(readKey)
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      headers: { "ratelimit-limit": "120", "ratelimit-remaining": "119", "ratelimit-reset": "60" },
    })
    mocks.requirePrismaClient.mockReset()
    mocks.sendTestWebhookForUser.mockReset()
    mocks.sendTestWebhookForUser.mockResolvedValue(null)
    mocks.requirePrismaClient.mockReturnValue({
      project: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("requires bearer API keys", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")

    const missing = await handlePublicApiV1Request("GET", new Request("https://tickward.test/api/v1/projects"), [
      "projects",
    ])
    expect(missing.status).toBe(401)
    await expect(missing.json()).resolves.toMatchObject({ error: { type: "missing_api_key" } })

    mocks.authenticateApiKey.mockResolvedValueOnce(null)
    const invalid = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/projects", { headers: { authorization: "Bearer tw_invalid" } }),
      ["projects"],
    )
    expect(invalid.status).toBe(403)
    await expect(invalid.json()).resolves.toMatchObject({ error: { type: "invalid_api_key" } })
  })

  it("exposes capabilities without an API key", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")

    const res = await handlePublicApiV1Request("GET", new Request("https://tickward.test/api/v1/capabilities"), [
      "capabilities",
    ])

    expect(res.status).toBe(200)
    expect(res.headers.get("request-id")).toEqual(expect.stringMatching(/^req_/))
    await expect(res.json()).resolves.toMatchObject({
      api_version: "v1",
      features: {
        delete_preview: { project: true, space: true, timer: false },
        idempotency_key: { enabled: true, ttl_hours: 24 },
        mcp: { remote_oauth: false },
        nested_project_create: true,
        project_preview: true,
        timer_reminders: true,
      },
      limits: { page_size_max: 100 },
      object: "capabilities",
    })
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
    expect(mocks.authenticateApiKey).not.toHaveBeenCalled()
  })

  it("marks remote MCP available when the deployment exposes an OAuth endpoint", async () => {
    process.env.TICKWARD_MCP_REMOTE_URL = "https://mcp.example.com/mcp"
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")

    const res = await handlePublicApiV1Request("GET", new Request("https://tickward.test/api/v1/capabilities"), [
      "capabilities",
    ])

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      features: {
        mcp: { remote_oauth: true },
      },
    })
  })

  it("allows read keys to list projects with rate limit headers", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const snapshot = makeProjectSnapshot({ name: "Main" })
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "project_123",
        ownerId: "user_123",
        name: "Main",
        color: null,
        snapshot,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date(snapshot.updatedAt),
        claimedAt: null,
      },
    ])
    mocks.requirePrismaClient.mockReturnValue({ project: { findMany } })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/projects", { headers: { authorization: "Bearer tw_read" } }),
      ["projects"],
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("ratelimit-limit")).toBe("120")
    await expect(res.json()).resolves.toMatchObject({
      object: "list",
      data: [{ object: "project", id: "project_123", timer_count: 1 }],
    })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: "user_123" }, take: 101 }))
  })

  it("includes the current effective date for recurring timers", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-08T12:00:00.000Z"))
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const snapshot = makeProjectSnapshot({
      name: "Main",
      timers: [
        {
          id: "timer_monthly",
          label: "Monthly renewal",
          targetDate: "2026-05-28T00:00:00.000Z",
          timezone: "Europe/Warsaw",
          createdAt: "2026-05-20T00:00:00.000Z",
          recurrence: { enabled: true, type: "monthly" },
        },
        {
          id: "timer_once",
          label: "One-off",
          targetDate: "2026-06-30T00:00:00.000Z",
          timezone: "Europe/Warsaw",
          createdAt: "2026-05-20T00:00:00.000Z",
        },
      ],
    })
    const findFirst = vi.fn().mockResolvedValue({
      id: "project_123",
      ownerId: "user_123",
      name: "Main",
      color: null,
      snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date(snapshot.updatedAt),
      claimedAt: null,
    })
    mocks.requirePrismaClient.mockReturnValue({ project: { findFirst } })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/projects/project_123/timers", {
        headers: { authorization: "Bearer tw_read" },
      }),
      ["projects", "project_123", "timers"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: [
        {
          id: "timer_monthly",
          project_name: "Main",
          target_date: "2026-05-28T00:00:00.000Z",
          effective_target_date: "2026-06-28T00:00:00.000Z",
        },
        {
          id: "timer_once",
          project_name: "Main",
          target_date: "2026-06-30T00:00:00.000Z",
          effective_target_date: "2026-06-30T00:00:00.000Z",
        },
      ],
    })
  })

  it("does not trust forwarded IP headers unless proxy trust is enabled", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const snapshot = makeProjectSnapshot({ name: "Main" })
    mocks.requirePrismaClient.mockReturnValue({
      project: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "project_123",
            ownerId: "user_123",
            name: "Main",
            color: null,
            snapshot,
            createdAt: new Date("2026-06-07T00:00:00.000Z"),
            updatedAt: new Date(snapshot.updatedAt),
            claimedAt: null,
          },
        ]),
      },
    })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/projects", {
        headers: { authorization: "Bearer tw_read", "x-forwarded-for": "203.0.113.10" },
      }),
      ["projects"],
    )

    expect(res.status).toBe(200)
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(1, "public-api-ip", "ip:unknown")
  })

  it("blocks read keys from writes", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_read" },
        body: JSON.stringify({ name: "Main" }),
      }),
      ["projects"],
    )

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "restricted_api_key" } })
  })

  it("blocks MCP connections without the required scope", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce({
      ...fullKey,
      kind: "mcp_connection",
      scopes: ["projects:read"],
    })

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_mcp_read" },
        body: JSON.stringify({ name: "Main" }),
      }),
      ["projects"],
    )

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: {
        details: {
          granted_scopes: ["projects:read"],
          required_scope: "projects:write",
        },
        remediation: { hint: expect.any(String) },
        type: "insufficient_scope",
      },
    })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("blocks MCP webhook writes without the webhooks write scope", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce({
      ...fullKey,
      kind: "mcp_connection",
      scopes: ["projects:write"],
    })

    const res = await handlePublicApiV1Request(
      "PATCH",
      new Request("https://tickward.test/api/v1/webhooks/wh_123", {
        method: "PATCH",
        headers: { authorization: "Bearer tw_mcp" },
        body: JSON.stringify({ event_types: ["timer.created"] }),
      }),
      ["webhooks", "wh_123"],
    )

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: {
        details: {
          granted_scopes: ["projects:write"],
          required_scope: "webhooks:write",
        },
        type: "insufficient_scope",
      },
    })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("lists webhook endpoints through the public API", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const findMany = vi.fn().mockResolvedValue([webhookEndpointRow()])
    mocks.requirePrismaClient.mockReturnValue({ webhookEndpoint: { findMany } })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/webhooks", { headers: { authorization: "Bearer tw_read" } }),
      ["webhooks"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      object: "list",
      data: [{ id: "wh_123", object: "webhook_endpoint", event_types: ["timer.ended"] }],
    })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user_123" } }))
  })

  it("updates webhook event subscriptions through the public API", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const updateManyAndReturn = vi.fn().mockResolvedValue([
      webhookEndpointRow({
        eventTypes: ["timer.created", "timer.ended"],
        updatedAt: new Date("2026-06-10T09:00:00Z"),
      }),
    ])
    mocks.requirePrismaClient.mockReturnValue({ webhookEndpoint: { updateManyAndReturn } })

    const res = await handlePublicApiV1Request(
      "PATCH",
      new Request("https://tickward.test/api/v1/webhooks/wh_123", {
        method: "PATCH",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({ event_types: ["timer.created", "timer.ended"] }),
      }),
      ["webhooks", "wh_123"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      id: "wh_123",
      event_types: ["timer.created", "timer.ended"],
      object: "webhook_endpoint",
    })
    expect(updateManyAndReturn).toHaveBeenCalledWith({
      where: { id: "wh_123", userId: "user_123" },
      data: { eventTypes: ["timer.created", "timer.ended"] },
    })
  })

  it("does not allow moving a share link to another timer", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)

    const res = await handlePublicApiV1Request(
      "PATCH",
      new Request("https://tickward.test/api/v1/projects/project_123/shares/share_123", {
        method: "PATCH",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({ timer_id: "timer_456" }),
      }),
      ["projects", "project_123", "shares", "share_123"],
    )

    expect(res.status).toBe(405)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "method_not_allowed" } })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("allows full access keys to create projects", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: "project_123",
      ownerId: data.ownerId,
      name: data.name,
      color: data.color,
      snapshot: data.snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: data.updatedAt,
      claimedAt: null,
    }))
    mocks.requirePrismaClient.mockReturnValue({ project: { create } })

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({ name: "Main" }),
      }),
      ["projects"],
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({ object: "project", id: "project_123", name: "Main" })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerId: "user_123" }) }),
    )
  })

  it("previews nested project creates without mutating or recording idempotency", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects/preview", {
        method: "POST",
        headers: { authorization: "Bearer tw_read", "Idempotency-Key": "preview-project-create" },
        body: JSON.stringify({
          name: "Subscriptions",
          spaces: [
            {
              id: "ai-tools",
              name: "AI tools",
              timers: [
                {
                  id: "timer-gpt-pro",
                  label: "GPT Pro renewal",
                  notify: true,
                  target_date: "2026-07-11T00:00:00.000Z",
                  timezone: "Europe/Warsaw",
                },
              ],
            },
          ],
          timers: [
            {
              id: "timer-flight",
              label: "Flight check-in",
              space_id: "ai-tools",
              target_date: "2026-08-01T18:00:00.000Z",
              timezone: "Europe/Warsaw",
            },
          ],
        }),
      }),
      ["projects", "preview"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      apply: {
        expected_plan_hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        method: "POST",
        path: "/api/v1/projects",
        requires_idempotency_key: true,
      },
      dry_run: true,
      object: "project_preview",
      operation: "create_project",
      plan_hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      summary: {
        projects: { create: 1 },
        spaces: { create: 1 },
        timers: { create: 2 },
      },
      warnings: [
        expect.objectContaining({
          code: "timer_notify_uses_account_settings",
          path: "#/timers/0/notify",
        }),
        expect.objectContaining({
          code: "timer_notify_uses_account_settings",
          path: "#/spaces/0/timers/0/notify",
        }),
      ],
    })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("creates nested projects with spaces and timers", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const input = {
      name: "Subscriptions",
      spaces: [
        {
          id: "ai-tools",
          name: "AI tools",
          timers: [
            {
              id: "timer-gpt-pro",
              label: "GPT Pro renewal",
              target_date: "2026-07-11T00:00:00.000Z",
              timezone: "Europe/Warsaw",
            },
          ],
        },
      ],
    }
    const preview = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects/preview", {
        method: "POST",
        headers: { authorization: "Bearer tw_read" },
        body: JSON.stringify(input),
      }),
      ["projects", "preview"],
    )
    const { plan_hash: planHash } = await preview.json()

    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const tx = {
      project: {
        create: vi.fn().mockImplementation(({ data }) => ({
          id: "project_123",
          ownerId: data.ownerId,
          name: data.name,
          color: data.color,
          snapshot: data.snapshot,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: data.updatedAt,
          claimedAt: null,
        })),
      },
      space: { create: vi.fn().mockResolvedValue({}) },
      timer: { create: vi.fn().mockResolvedValue({}) },
      notificationOutboxItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      webhookEvent: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    const transaction = vi.fn(async (callback: (client: typeof tx) => unknown | Promise<unknown>) => callback(tx))
    mocks.requirePrismaClient.mockReturnValue({ $transaction: transaction })

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({ ...input, expected_plan_hash: planHash }),
      }),
      ["projects"],
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      id: "project_123",
      name: "Subscriptions",
      spaces: [{ id: "ai-tools", name: "AI tools" }],
      timers: [{ id: "timer-gpt-pro", label: "GPT Pro renewal", space_id: "ai-tools" }],
    })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(tx.space.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: "ai-tools", projectId: "project_123" }) }),
    )
    expect(tx.timer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: "timer-gpt-pro", projectId: "project_123" }) }),
    )
    expect(tx.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateId: "project_123",
        aggregateType: "project",
        projectId: "project_123",
        type: "project.created",
        userId: "user_123",
      }),
    })
    expect(tx.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateId: "timer-gpt-pro",
        aggregateType: "timer",
        projectId: "project_123",
        timerId: "timer-gpt-pro",
        type: "timer.created",
        userId: "user_123",
      }),
    })
    expect(tx.webhookEvent.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        aggregateId: "timer-gpt-pro",
        aggregateType: "timer",
        projectId: "project_123",
        timerId: "timer-gpt-pro",
        type: "timer.ended",
        userId: "user_123",
      }),
      update: expect.objectContaining({ status: "pending" }),
      where: { dedupeKey: expect.stringContaining("timer.ended:user_123:project_123:timer-gpt-pro:") },
    })
  })

  it("rejects project creates when expected plan hash does not match", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({ expected_plan_hash: `sha256:${"0".repeat(64)}`, name: "Subscriptions" }),
      }),
      ["projects"],
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "plan_hash_mismatch" } })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("rejects invalid idempotency keys before hitting storage", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "bad key" },
        body: JSON.stringify({ name: "Main" }),
      }),
      ["projects"],
    )

    expect(res.status).toBe(400)
    expect(res.headers.get("request-id")).toEqual(expect.stringMatching(/^req_/))
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "validation_error",
        correlation_id: expect.stringMatching(/^corr_/),
        remediation: { hint: expect.any(String) },
        request_id: expect.stringMatching(/^req_/),
        retryable: false,
        type: "validation_error",
      },
    })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("replays idempotent project creates without creating duplicates", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValue(fullKey)
    const idempotencyRows = new Map<string, Record<string, unknown>>()
    const idempotencyKey = "agent-project-create-2026-06-07"
    const idempotency = {
      create: vi.fn(({ data }) => {
        const cacheKey = idempotencyCacheKey(data)
        if (idempotencyRows.has(cacheKey)) {
          throw Object.assign(new Error("unique constraint"), { code: "P2002" })
        }
        const row = {
          ...data,
          id: "idem_123",
          responseBody: null,
          responseStatus: null,
          completedAt: null,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        }
        idempotencyRows.set(cacheKey, row)
        return row
      }),
      delete: vi.fn(),
      findUnique: vi.fn(({ where }) => idempotencyRows.get(idempotencyWhereKey(where))),
      update: vi.fn(({ data, where }) => {
        const row = [...idempotencyRows.values()].find((item) => item.id === where.id)
        if (!row) throw new Error("missing idempotency row")
        Object.assign(row, data)
        return row
      }),
    }
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: "project_123",
      ownerId: data.ownerId,
      name: data.name,
      color: data.color,
      snapshot: data.snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: data.updatedAt,
      claimedAt: null,
    }))
    mocks.requirePrismaClient.mockReturnValue({ project: { create }, publicApiIdempotencyKey: idempotency })

    const body = JSON.stringify({ name: "Agent Import" })
    const request = () =>
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": idempotencyKey },
        body,
      })

    const first = await handlePublicApiV1Request("POST", request(), ["projects"])
    const second = await handlePublicApiV1Request("POST", request(), ["projects"])

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.headers.get("idempotency-replayed")).toBe("true")
    expect(second.headers.get("idempotency-key-expires-at")).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/))
    await expect(first.json()).resolves.toMatchObject({ object: "project", id: "project_123", name: "Agent Import" })
    await expect(second.json()).resolves.toMatchObject({ object: "project", id: "project_123", name: "Agent Import" })
    expect(idempotency.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ keyHash: expect.any(String) }))
    expect(idempotency.create.mock.calls[0][0].data.keyHash).not.toContain(idempotencyKey)
    expect(idempotency.create.mock.calls[0][0].data.key).toBeUndefined()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("treats equivalent JSON bodies as the same idempotent request", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValue(fullKey)
    const idempotencyRows = new Map<string, Record<string, unknown>>()
    const idempotency = {
      create: vi.fn(({ data }) => {
        const cacheKey = idempotencyCacheKey(data)
        if (idempotencyRows.has(cacheKey)) {
          throw Object.assign(new Error("unique constraint"), { code: "P2002" })
        }
        const row = {
          ...data,
          id: "idem_123",
          responseBody: null,
          responseStatus: null,
          completedAt: null,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        }
        idempotencyRows.set(cacheKey, row)
        return row
      }),
      delete: vi.fn(),
      findUnique: vi.fn(({ where }) => idempotencyRows.get(idempotencyWhereKey(where))),
      update: vi.fn(({ data, where }) => {
        const row = [...idempotencyRows.values()].find((item) => item.id === where.id)
        if (!row) throw new Error("missing idempotency row")
        Object.assign(row, data)
        return row
      }),
    }
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: "project_123",
      ownerId: data.ownerId,
      name: data.name,
      color: data.color,
      snapshot: data.snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: data.updatedAt,
      claimedAt: null,
    }))
    mocks.requirePrismaClient.mockReturnValue({ project: { create }, publicApiIdempotencyKey: idempotency })

    const first = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "agent-project-create-2026-06-07" },
        body: JSON.stringify({ color: "#111827", name: "Agent Import" }),
      }),
      ["projects"],
    )
    const second = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "agent-project-create-2026-06-07" },
        body: JSON.stringify({ name: "Agent Import", color: "#111827" }),
      }),
      ["projects"],
    )

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.headers.get("idempotency-replayed")).toBe("true")
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("reports in-progress idempotency keys without running the write twice", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValue(fullKey)
    const idempotencyRows = new Map<string, Record<string, unknown>>()
    const idempotency = {
      create: vi.fn(({ data }) => {
        idempotencyRows.set(idempotencyCacheKey(data), {
          ...data,
          id: "idem_123",
          responseBody: null,
          responseStatus: null,
          completedAt: null,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        })
        throw Object.assign(new Error("unique constraint"), { code: "P2002" })
      }),
      delete: vi.fn(),
      findUnique: vi.fn(({ where }) => idempotencyRows.get(idempotencyWhereKey(where))),
      update: vi.fn(),
    }
    const create = vi.fn()
    mocks.requirePrismaClient.mockReturnValue({ project: { create }, publicApiIdempotencyKey: idempotency })

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "agent-project-create-2026-06-07" },
        body: JSON.stringify({ name: "Agent Import" }),
      }),
      ["projects"],
    )

    expect(res.status).toBe(409)
    expect(res.headers.get("retry-after")).toBe("1")
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "idempotency_key_in_progress",
        remediation: { hint: expect.any(String) },
        retryable: true,
        type: "idempotency_key_in_progress",
      },
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("rejects idempotency key reuse for different requests", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValue(fullKey)
    const idempotencyRows = new Map<string, Record<string, unknown>>()
    const idempotency = {
      create: vi.fn(({ data }) => {
        const row = {
          ...data,
          id: "idem_123",
          responseBody: null,
          responseStatus: null,
          completedAt: null,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        }
        idempotencyRows.set(idempotencyCacheKey(data), row)
        return row
      }),
      delete: vi.fn(),
      findUnique: vi.fn(({ where }) => idempotencyRows.get(idempotencyWhereKey(where))),
      update: vi.fn(({ data, where }) => {
        const row = [...idempotencyRows.values()].find((item) => item.id === where.id)
        if (!row) throw new Error("missing idempotency row")
        Object.assign(row, data)
        return row
      }),
    }
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: "project_123",
      ownerId: data.ownerId,
      name: data.name,
      color: data.color,
      snapshot: data.snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: data.updatedAt,
      claimedAt: null,
    }))
    mocks.requirePrismaClient.mockReturnValue({ project: { create }, publicApiIdempotencyKey: idempotency })

    const first = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "agent-project-create-2026-06-07" },
        body: JSON.stringify({ name: "Agent Import" }),
      }),
      ["projects"],
    )
    const second = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "agent-project-create-2026-06-07" },
        body: JSON.stringify({ name: "Different Import" }),
      }),
      ["projects"],
    )

    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
    await expect(second.json()).resolves.toMatchObject({ error: { type: "idempotency_conflict" } })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("replays validation errors for idempotent requests", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValue(fullKey)
    const idempotencyRows = new Map<string, Record<string, unknown>>()
    const idempotency = {
      create: vi.fn(({ data }) => {
        const cacheKey = idempotencyCacheKey(data)
        if (idempotencyRows.has(cacheKey)) {
          throw Object.assign(new Error("unique constraint"), { code: "P2002" })
        }
        const row = {
          ...data,
          id: "idem_123",
          responseBody: null,
          responseStatus: null,
          completedAt: null,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        }
        idempotencyRows.set(cacheKey, row)
        return row
      }),
      delete: vi.fn(),
      findUnique: vi.fn(({ where }) => idempotencyRows.get(idempotencyWhereKey(where))),
      update: vi.fn(({ data, where }) => {
        const row = [...idempotencyRows.values()].find((item) => item.id === where.id)
        if (!row) throw new Error("missing idempotency row")
        Object.assign(row, data)
        return row
      }),
    }
    const create = vi.fn()
    mocks.requirePrismaClient.mockReturnValue({ project: { create }, publicApiIdempotencyKey: idempotency })

    const request = () =>
      new Request("https://tickward.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "agent-project-create-2026-06-07" },
        body: JSON.stringify({ name: "" }),
      })

    const first = await handlePublicApiV1Request("POST", request(), ["projects"])
    const second = await handlePublicApiV1Request("POST", request(), ["projects"])

    expect(first.status).toBe(400)
    expect(second.status).toBe(400)
    expect(second.headers.get("idempotency-replayed")).toBe("true")
    await expect(second.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(create).not.toHaveBeenCalled()
  })

  it("replays idempotent deletes instead of running a second delete", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValue(fullKey)
    const idempotencyRows = new Map<string, Record<string, unknown>>()
    const idempotency = {
      create: vi.fn(({ data }) => {
        const cacheKey = idempotencyCacheKey(data)
        if (idempotencyRows.has(cacheKey)) {
          throw Object.assign(new Error("unique constraint"), { code: "P2002" })
        }
        const row = {
          ...data,
          id: "idem_123",
          responseBody: null,
          responseStatus: null,
          completedAt: null,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        }
        idempotencyRows.set(cacheKey, row)
        return row
      }),
      delete: vi.fn(),
      findUnique: vi.fn(({ where }) => idempotencyRows.get(idempotencyWhereKey(where))),
      update: vi.fn(({ data, where }) => {
        const row = [...idempotencyRows.values()].find((item) => item.id === where.id)
        if (!row) throw new Error("missing idempotency row")
        Object.assign(row, data)
        return row
      }),
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      notificationDeliveryLog: { deleteMany: vi.fn() },
      notificationOutboxItem: { deleteMany: vi.fn() },
      project: {
        delete: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({
          id: "project_123",
          ownerId: "user_123",
          name: "Main",
          color: null,
          snapshot: makeProjectSnapshot({ name: "Main", timers: [] }),
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
          claimedAt: null,
        }),
      },
      projectAccessToken: { deleteMany: vi.fn() },
      share: { deleteMany: vi.fn() },
      space: { deleteMany: vi.fn() },
      timer: {
        deleteMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const transaction = vi.fn(async (callback: (client: typeof tx) => unknown | Promise<unknown>) => callback(tx))
    mocks.requirePrismaClient.mockReturnValue({
      $transaction: transaction,
      publicApiIdempotencyKey: idempotency,
    })

    const request = () =>
      new Request("https://tickward.test/api/v1/projects/project_123", {
        method: "DELETE",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "agent-delete-2026-06-07" },
      })

    const first = await handlePublicApiV1Request("DELETE", request(), ["projects", "project_123"])
    const second = await handlePublicApiV1Request("DELETE", request(), ["projects", "project_123"])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.headers.get("idempotency-replayed")).toBe("true")
    await expect(second.json()).resolves.toMatchObject({ object: "project", id: "project_123", deleted: true })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(tx.project.delete).toHaveBeenCalledTimes(1)
  })

  it("previews project deletes without mutating or recording idempotency", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({
      name: "Main",
      spaces: [{ id: "space-a", name: "Work", createdAt: "2026-05-20T00:00:00.000Z" }],
      timers: [
        {
          id: "timer-a",
          label: "Launch",
          targetDate: "2026-05-25T12:00:00.000Z",
          timezone: "Europe/Warsaw",
          createdAt: "2026-05-20T00:00:00.000Z",
        },
      ],
    })
    const findFirst = vi.fn().mockResolvedValue({
      id: "project_123",
      ownerId: "user_123",
      name: "Main",
      color: null,
      snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date(snapshot.updatedAt),
      claimedAt: null,
    })
    const count = vi.fn().mockResolvedValue(2)
    const prisma = { project: { findFirst }, share: { count } }
    mocks.requirePrismaClient.mockReturnValue(prisma)

    const res = await handlePublicApiV1Request(
      "DELETE",
      new Request("https://tickward.test/api/v1/projects/project_123?dry_run=true", {
        method: "DELETE",
        headers: { authorization: "Bearer tw_full", "Idempotency-Key": "preview-delete-project" },
      }),
      ["projects", "project_123"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      apply: {
        method: "DELETE",
        path: "/api/v1/projects/project_123",
        requires_idempotency_key: true,
      },
      dry_run: true,
      object: "delete_preview",
      operation: "delete_project",
      changes: [
        { action: "delete", id: "project_123", name: "Main", type: "project" },
        { action: "delete", id: "space-a", name: "Work", reason: "cascade", type: "space" },
        { action: "delete", id: "timer-a", label: "Launch", reason: "cascade", type: "timer" },
      ],
      summary: {
        projects: { delete: 1 },
        share_links: { delete: 2 },
        spaces: { delete: 1 },
        timers: { delete: 1 },
      },
      target: { id: "project_123", name: "Main", type: "project" },
    })
    expect(count).toHaveBeenCalledWith({ where: { projectId: "project_123" } })
    expect(prisma).not.toHaveProperty("publicApiIdempotencyKey")
  })

  it("previews space deletes as timer updates for read keys", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const snapshot = makeProjectSnapshot({
      name: "Main",
      spaces: [{ id: "space-a", name: "Work", createdAt: "2026-05-20T00:00:00.000Z" }],
      timers: [
        {
          id: "timer-a",
          label: "Launch",
          spaceId: "space-a",
          targetDate: "2026-05-25T12:00:00.000Z",
          timezone: "Europe/Warsaw",
          createdAt: "2026-05-20T00:00:00.000Z",
        },
        {
          id: "timer-b",
          label: "Renewal",
          targetDate: "2026-06-25T12:00:00.000Z",
          timezone: "Europe/Warsaw",
          createdAt: "2026-05-20T00:00:00.000Z",
        },
      ],
    })
    const findFirst = vi.fn().mockResolvedValue({
      id: "project_123",
      ownerId: "user_123",
      name: "Main",
      color: null,
      snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date(snapshot.updatedAt),
      claimedAt: null,
    })
    mocks.requirePrismaClient.mockReturnValue({ project: { findFirst } })

    const res = await handlePublicApiV1Request(
      "DELETE",
      new Request("https://tickward.test/api/v1/projects/project_123/spaces/space-a?dry_run=true", {
        method: "DELETE",
        headers: { authorization: "Bearer tw_read" },
      }),
      ["projects", "project_123", "spaces", "space-a"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      changes: [
        {
          action: "delete",
          id: "space-a",
          name: "Work",
          project_id: "project_123",
          project_name: "Main",
          type: "space",
        },
        {
          action: "update",
          id: "timer-a",
          label: "Launch",
          project_id: "project_123",
          project_name: "Main",
          reason: "space_removed",
          type: "timer",
        },
      ],
      operation: "delete_space",
      summary: {
        share_links: { delete: 0 },
        spaces: { delete: 1 },
        timers: { update: 1 },
      },
      target: { id: "space-a", name: "Work", project_id: "project_123", project_name: "Main", type: "space" },
    })
  })

  it("includes project names in space responses for agent confirmations", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const snapshot = makeProjectSnapshot({
      name: "Main",
      spaces: [{ id: "space-a", name: "Work", createdAt: "2026-05-20T00:00:00.000Z" }],
    })
    const findFirst = vi.fn().mockResolvedValue({
      id: "project_123",
      ownerId: "user_123",
      name: "Main",
      color: null,
      snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date(snapshot.updatedAt),
      claimedAt: null,
    })
    mocks.requirePrismaClient.mockReturnValue({ project: { findFirst } })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/projects/project_123/spaces", {
        headers: { authorization: "Bearer tw_read" },
      }),
      ["projects", "project_123", "spaces"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: [
        {
          id: "space-a",
          name: "Work",
          project_id: "project_123",
          project_name: "Main",
        },
      ],
    })
  })

  it("includes project and timer labels in share responses for agent confirmations", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const snapshot = makeProjectSnapshot({
      name: "Main",
      timers: [
        {
          id: "timer-a",
          label: "Launch",
          targetDate: "2026-05-25T12:00:00.000Z",
          timezone: "Europe/Warsaw",
          createdAt: "2026-05-20T00:00:00.000Z",
        },
      ],
    })
    const findFirst = vi.fn().mockResolvedValue({
      id: "project_123",
      ownerId: "user_123",
      name: "Main",
      color: null,
      snapshot,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date(snapshot.updatedAt),
      claimedAt: null,
    })
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "share_123",
        data: { sharedAt: "2026-06-07T12:10:00.000Z", timerId: "timer-a" },
        createdAt: new Date("2026-06-07T12:10:00.000Z"),
        updatedAt: new Date("2026-06-07T12:10:00.000Z"),
      },
    ])
    mocks.requirePrismaClient.mockReturnValue({ project: { findFirst }, share: { findMany } })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/projects/project_123/shares", {
        headers: { authorization: "Bearer tw_read" },
      }),
      ["projects", "project_123", "shares"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: [
        {
          id: "share_123",
          project_id: "project_123",
          project_name: "Main",
          timer_id: "timer-a",
          timer_label: "Launch",
          url_path: "/share/share_123",
        },
      ],
    })
  })

  it("serializes timer writes by locking the project row", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({ name: "Main", timers: [] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue({
          id: "project_123",
          ownerId: "user_123",
          name: "Main",
          color: null,
          snapshot,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date(snapshot.updatedAt),
          claimedAt: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      notificationOutboxItem: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      timer: {
        create: vi.fn().mockResolvedValue({}),
      },
    }
    const transaction = vi.fn(async (callback: (client: typeof tx) => unknown | Promise<unknown>) => callback(tx))
    mocks.requirePrismaClient.mockReturnValue({ $transaction: transaction })

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects/project_123/timers", {
        method: "POST",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({
          label: "Launch",
          reminders: [{ offset_minutes: 10 }],
          target_date: "2026-12-01T10:00:00.000Z",
          timezone: "UTC",
        }),
      }),
      ["projects", "project_123", "timers"],
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      reminders: [{ offset_minutes: 10 }],
    })
    const queryText = Array.from(tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?")
    expect(queryText).toContain("FOR UPDATE")
    expect(tx.timer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({ reminders: [{ offsetMinutes: 10 }] }),
          ownerId: "user_123",
          projectId: "project_123",
        }),
      }),
    )
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snapshot: expect.anything() }),
        where: { id: "project_123" },
      }),
    )
  })

  it("maps a cross-project timer id collision to the duplicate-id error", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({ name: "Main", timers: [] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue({
          id: "project_123",
          ownerId: "user_123",
          name: "Main",
          color: null,
          snapshot,
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date(snapshot.updatedAt),
          claimedAt: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      timer: {
        create: vi.fn().mockRejectedValue(Object.assign(new Error("unique constraint"), { code: "P2002" })),
      },
    }
    const transaction = vi.fn(async (callback: (client: typeof tx) => unknown | Promise<unknown>) => callback(tx))
    mocks.requirePrismaClient.mockReturnValue({ $transaction: transaction })

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects/project_123/timers", {
        method: "POST",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({
          id: "cc-5h-1751700000",
          label: "Launch",
          target_date: "2026-12-01T10:00:00.000Z",
          timezone: "UTC",
        }),
      }),
      ["projects", "project_123", "timers"],
    )

    expect(res.status).toBe(400)
    await expect(res.text()).resolves.toContain("Timer id already exists.")
  })

  it("rejects per-timer notification channel settings in public timer writes", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects/project_123/timers", {
        method: "POST",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({
          label: "Launch",
          target_date: "2026-12-01T10:00:00.000Z",
          timezone: "UTC",
          notification: {
            enabled: true,
            channels: { email: true },
            presentation: { sound: "glass", fullPageAlarm: true, requireInteraction: true },
          },
        }),
      }),
      ["projects", "project_123", "timers"],
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "validation_error",
        details: [expect.objectContaining({ path: ["notification"] })],
        errors: [
          expect.objectContaining({
            code: "validation_error",
            path: "#/notification",
            remediation: expect.any(String),
          }),
        ],
        remediation: { hint: expect.any(String) },
        retryable: false,
        type: "validation_error",
      },
    })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("rejects duplicate reminder offsets in public timer writes", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)

    const res = await handlePublicApiV1Request(
      "POST",
      new Request("https://tickward.test/api/v1/projects/project_123/timers", {
        method: "POST",
        headers: { authorization: "Bearer tw_full" },
        body: JSON.stringify({
          label: "Launch",
          reminders: [{ offset_minutes: 10 }, { offset_minutes: 10 }],
          target_date: "2026-12-01T10:00:00.000Z",
          timezone: "UTC",
        }),
      }),
      ["projects", "project_123", "timers"],
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: {
        details: [expect.objectContaining({ path: ["reminders", 1, "offset_minutes"] })],
        type: "validation_error",
      },
    })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("updates timers with webhook, timer-ended, reminder, and snapshot side effects", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-08T12:00:00.000Z"))
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({
      name: "Main",
      spaces: [makeSpace({ id: "space-a", name: "Work" })],
      timers: [
        makeTimer({
          id: "timer-a",
          label: "Launch",
          targetDate: "2026-12-01T10:00:00.000Z",
          timezone: "UTC",
        }),
      ],
    })
    const row = projectRow(snapshot)
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      notificationOutboxItem: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue({}),
      },
      timer: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      webhookEvent: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "PATCH",
      publicApiRequest("PATCH", "/projects/project_123/timers/timer-a", {
        label: "Updated launch",
        reminders: [{ offset_minutes: 60 }],
        target_date: "2026-12-10T10:00:00.000Z",
      }),
      ["projects", "project_123", "timers", "timer-a"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      id: "timer-a",
      label: "Updated launch",
      reminders: [{ offset_minutes: 60 }],
      target_date: "2026-12-10T10:00:00.000Z",
    })
    expect(tx.timer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            label: "Updated launch",
            reminders: [{ offsetMinutes: 60 }],
            targetDate: "2026-12-10T10:00:00.000Z",
          }),
        }),
        where: { id: "timer-a", projectId: "project_123" },
      }),
    )
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            timers: [expect.objectContaining({ id: "timer-a", label: "Updated launch" })],
          }),
        }),
        where: { id: "project_123" },
      }),
    )
    expect(tx.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateId: "timer-a",
        aggregateType: "timer",
        projectId: "project_123",
        timerId: "timer-a",
        type: "timer.updated",
        userId: "user_123",
      }),
    })
    expect(tx.webhookEvent.updateMany).toHaveBeenCalledWith({
      data: { cancelledAt: expect.any(Date), status: "cancelled" },
      where: {
        projectId: "project_123",
        status: "pending",
        timerId: "timer-a",
        type: "timer.ended",
        userId: "user_123",
      },
    })
    expect(tx.webhookEvent.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        aggregateId: "timer-a",
        availableAt: new Date("2026-12-10T10:00:00.000Z"),
        projectId: "project_123",
        timerId: "timer-a",
        type: "timer.ended",
      }),
      update: expect.objectContaining({ status: "pending" }),
      where: {
        dedupeKey: "timer.ended:user_123:project_123:timer-a:2026-12-10T10:00:00.000Z",
      },
    })
    expect(tx.notificationOutboxItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { cancelledAt: expect.any(Date), status: "cancelled" },
        where: expect.objectContaining({
          status: "scheduled",
          timerId: "timer-a",
          workflowIdentifier: "timer.reminder",
        }),
      }),
    )
    expect(tx.notificationOutboxItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            scheduledFor: new Date("2026-12-10T09:00:00.000Z"),
            status: "scheduled",
            timerId: "timer-a",
            transactionId: "timer-reminder:project_123:timer-a:60m:2026-12-10T10:00:00.000Z",
          }),
        ],
      }),
    )
  })

  it("archives timers by cancelling timer-ended and reminder schedules", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-08T12:00:00.000Z"))
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({
      name: "Main",
      timers: [
        makeTimer({
          id: "timer-a",
          label: "Launch",
          reminders: [{ offsetMinutes: 30 }],
          targetDate: "2026-12-01T10:00:00.000Z",
          timezone: "UTC",
        }),
      ],
    })
    const row = projectRow(snapshot)
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      notificationOutboxItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue({}),
      },
      timer: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      webhookEvent: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "PATCH",
      publicApiRequest("PATCH", "/projects/project_123/timers/timer-a", {
        archived_at: "2026-06-08T12:00:00.000Z",
      }),
      ["projects", "project_123", "timers", "timer-a"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      archived_at: "2026-06-08T12:00:00.000Z",
      id: "timer-a",
    })
    expect(tx.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "timer.archived" }),
    })
    expect(tx.webhookEvent.updateMany).toHaveBeenCalledWith({
      data: { cancelledAt: expect.any(Date), status: "cancelled" },
      where: {
        projectId: "project_123",
        status: "pending",
        timerId: "timer-a",
        type: "timer.ended",
        userId: "user_123",
      },
    })
    expect(tx.webhookEvent.upsert).not.toHaveBeenCalled()
    expect(tx.notificationOutboxItem.updateMany).toHaveBeenCalledWith({
      data: { cancelledAt: expect.any(Date), status: "cancelled" },
      where: {
        status: "scheduled",
        timerId: "timer-a",
        workflowIdentifier: "timer.reminder",
        payload: { path: ["projectId"], equals: "project_123" },
      },
    })
  })

  it("returns storage_unavailable when timer updates cannot sync the timer row", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({ name: "Main", timers: [makeTimer({ id: "timer-a" })] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn(),
      },
      timer: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      webhookEvent: {
        create: vi.fn(),
      },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "PATCH",
      publicApiRequest("PATCH", "/projects/project_123/timers/timer-a", { label: "Updated launch" }),
      ["projects", "project_123", "timers", "timer-a"],
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
    expect(tx.project.update).not.toHaveBeenCalled()
    expect(tx.webhookEvent.create).not.toHaveBeenCalled()
  })

  it("deletes timers with schedule cancellation, reminder cleanup, share cleanup, and snapshot sync", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({
      name: "Main",
      timers: [makeTimer({ id: "timer-a", label: "Launch", reminders: [{ offsetMinutes: 10 }] })],
    })
    const row = projectRow(snapshot)
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      notificationDeliveryLog: { deleteMany: vi.fn().mockResolvedValue({}) },
      notificationOutboxItem: {
        deleteMany: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue({}),
      },
      share: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      timer: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      webhookEvent: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
      },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "DELETE",
      publicApiRequest("DELETE", "/projects/project_123/timers/timer-a"),
      ["projects", "project_123", "timers", "timer-a"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      deleted: true,
      id: "timer-a",
      label: "Launch",
      object: "timer",
    })
    expect(tx.webhookEvent.updateMany).toHaveBeenCalledWith({
      data: { cancelledAt: expect.any(Date), status: "cancelled" },
      where: {
        projectId: "project_123",
        status: "pending",
        timerId: "timer-a",
        type: "timer.ended",
        userId: "user_123",
      },
    })
    expect(tx.notificationOutboxItem.updateMany).toHaveBeenCalledWith({
      data: { cancelledAt: expect.any(Date), status: "cancelled" },
      where: {
        status: "scheduled",
        timerId: "timer-a",
        workflowIdentifier: "timer.reminder",
        payload: { path: ["projectId"], equals: "project_123" },
      },
    })
    expect(tx.notificationOutboxItem.deleteMany).toHaveBeenCalledWith({
      where: { timerId: "timer-a", payload: { path: ["projectId"], equals: "project_123" } },
    })
    expect(tx.notificationDeliveryLog.deleteMany).toHaveBeenCalledWith({
      where: {
        timerId: "timer-a",
        OR: [
          { transactionId: { startsWith: "timer-reminder:project_123:" } },
          { transactionId: { startsWith: "timer-reminder:timer-a:" } },
        ],
      },
    })
    expect(tx.share.deleteMany).toHaveBeenCalledWith({
      where: { data: { equals: "timer-a", path: ["timerId"] }, kind: "timer", projectId: "project_123" },
    })
    expect(tx.timer.deleteMany).toHaveBeenCalledWith({ where: { id: "timer-a", projectId: "project_123" } })
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snapshot: expect.objectContaining({ timers: [] }) }),
        where: { id: "project_123" },
      }),
    )
    expect(tx.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateId: "timer-a",
        aggregateType: "timer",
        projectId: "project_123",
        timerId: "timer-a",
        type: "timer.deleted",
      }),
    })
  })

  it("returns storage_unavailable when timer deletes cannot sync the timer row", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({ name: "Main", timers: [makeTimer({ id: "timer-a" })] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      notificationDeliveryLog: { deleteMany: vi.fn() },
      notificationOutboxItem: { deleteMany: vi.fn(), updateMany: vi.fn() },
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn(),
      },
      share: { deleteMany: vi.fn() },
      timer: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      webhookEvent: { create: vi.fn(), updateMany: vi.fn() },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "DELETE",
      publicApiRequest("DELETE", "/projects/project_123/timers/timer-a"),
      ["projects", "project_123", "timers", "timer-a"],
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
    expect(tx.project.update).not.toHaveBeenCalled()
    expect(tx.webhookEvent.create).not.toHaveBeenCalled()
  })

  it("creates spaces and syncs the project snapshot", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-08T12:00:00.000Z"))
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({ name: "Main", spaces: [], timers: [] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn().mockResolvedValue({}),
      },
      space: { create: vi.fn().mockResolvedValue({}) },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "POST",
      publicApiRequest("POST", "/projects/project_123/spaces", {
        color: "#123456",
        id: "space-b",
        name: "Personal",
      }),
      ["projects", "project_123", "spaces"],
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({ id: "space-b", name: "Personal", object: "space" })
    expect(tx.space.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: expect.objectContaining({ color: "#123456", id: "space-b", name: "Personal" }),
        id: "space-b",
        ownerId: "user_123",
        projectId: "project_123",
      }),
    })
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            spaces: [expect.objectContaining({ id: "space-b", name: "Personal" })],
          }),
        }),
        where: { id: "project_123" },
      }),
    )
  })

  it("rejects duplicate space ids before writing rows", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({
      name: "Main",
      spaces: [makeSpace({ id: "space-a", name: "Work" })],
      timers: [],
    })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn(),
      },
      space: { create: vi.fn() },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "POST",
      publicApiRequest("POST", "/projects/project_123/spaces", { id: "space-a", name: "Duplicate" }),
      ["projects", "project_123", "spaces"],
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(tx.space.create).not.toHaveBeenCalled()
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it("updates spaces and syncs the project snapshot", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({
      name: "Main",
      spaces: [makeSpace({ color: "#111111", id: "space-a", name: "Work" })],
      timers: [],
    })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn().mockResolvedValue({}),
      },
      space: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "PATCH",
      publicApiRequest("PATCH", "/projects/project_123/spaces/space-a", { color: null, name: "Personal" }),
      ["projects", "project_123", "spaces", "space-a"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ color: null, id: "space-a", name: "Personal" })
    expect(tx.space.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: expect.objectContaining({ id: "space-a", name: "Personal" }),
        updatedAt: expect.any(Date),
      }),
      where: { id: "space-a", projectId: "project_123" },
    })
    expect(tx.space.updateMany.mock.calls[0][0].data.data).not.toHaveProperty("color")
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            spaces: [expect.objectContaining({ id: "space-a", name: "Personal" })],
          }),
        }),
        where: { id: "project_123" },
      }),
    )
  })

  it("returns storage_unavailable when space updates cannot sync the space row", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({ spaces: [makeSpace({ id: "space-a" })], timers: [] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn(),
      },
      space: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "PATCH",
      publicApiRequest("PATCH", "/projects/project_123/spaces/space-a", { name: "Personal" }),
      ["projects", "project_123", "spaces", "space-a"],
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it("deletes spaces, clears affected timer space ids, and syncs the snapshot", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({
      name: "Main",
      spaces: [makeSpace({ id: "space-a", name: "Work" })],
      timers: [
        makeTimer({ id: "timer-a", label: "Launch", spaceId: "space-a" }),
        makeTimer({ id: "timer-b", label: "Renewal" }),
      ],
    })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn().mockResolvedValue({}),
      },
      space: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      timer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "DELETE",
      publicApiRequest("DELETE", "/projects/project_123/spaces/space-a"),
      ["projects", "project_123", "spaces", "space-a"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ deleted: true, id: "space-a", name: "Work" })
    expect(tx.space.deleteMany).toHaveBeenCalledWith({ where: { id: "space-a", projectId: "project_123" } })
    expect(tx.timer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({ id: "timer-a", label: "Launch" }),
        }),
        where: { id: "timer-a", projectId: "project_123" },
      }),
    )
    expect(tx.timer.updateMany.mock.calls[0][0].data.data).not.toHaveProperty("spaceId")
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            spaces: [],
            timers: [expect.not.objectContaining({ spaceId: "space-a" }), expect.objectContaining({ id: "timer-b" })],
          }),
        }),
        where: { id: "project_123" },
      }),
    )
  })

  it("returns storage_unavailable when space deletes cannot sync the space row", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({ spaces: [makeSpace({ id: "space-a" })], timers: [] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn(),
      },
      space: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      timer: { updateMany: vi.fn() },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "DELETE",
      publicApiRequest("DELETE", "/projects/project_123/spaces/space-a"),
      ["projects", "project_123", "spaces", "space-a"],
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
    expect(tx.timer.updateMany).not.toHaveBeenCalled()
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it("returns storage_unavailable when space deletes cannot sync affected timer rows", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const snapshot = makeProjectSnapshot({
      spaces: [makeSpace({ id: "space-a" })],
      timers: [makeTimer({ id: "timer-a", spaceId: "space-a" })],
    })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn(),
      },
      space: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      timer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "DELETE",
      publicApiRequest("DELETE", "/projects/project_123/spaces/space-a"),
      ["projects", "project_123", "spaces", "space-a"],
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it("deletes shares, emits share.deleted, clears timer sharing, and syncs the snapshot", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const sharedAt = "2026-06-07T12:10:00.000Z"
    const snapshot = makeProjectSnapshot({
      name: "Main",
      timers: [makeTimer({ id: "timer-a", label: "Launch", sharedAt })],
    })
    const share = {
      id: "share_123",
      data: { sharedAt, timerId: "timer-a" },
      createdAt: new Date(sharedAt),
      updatedAt: new Date(sharedAt),
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn().mockResolvedValue({}),
      },
      share: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(share),
      },
      timer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      webhookEvent: { create: vi.fn().mockResolvedValue({}) },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "DELETE",
      publicApiRequest("DELETE", "/projects/project_123/shares/share_123"),
      ["projects", "project_123", "shares", "share_123"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      deleted: true,
      id: "share_123",
      timer_id: "timer-a",
      timer_label: "Launch",
    })
    expect(tx.share.deleteMany).toHaveBeenCalledWith({
      where: { id: "share_123", kind: "timer", projectId: "project_123" },
    })
    expect(tx.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateId: "share_123",
        aggregateType: "share",
        projectId: "project_123",
        shareId: "share_123",
        timerId: "timer-a",
        type: "share.deleted",
      }),
    })
    expect(tx.timer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({ id: "timer-a", label: "Launch" }),
        }),
        where: { id: "timer-a", projectId: "project_123" },
      }),
    )
    expect(tx.timer.updateMany.mock.calls[0][0].data.data).not.toHaveProperty("sharedAt")
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            timers: [expect.not.objectContaining({ sharedAt })],
          }),
        }),
        where: { id: "project_123" },
      }),
    )
  })

  it("returns storage_unavailable when share deletes cannot sync the share row", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const sharedAt = "2026-06-07T12:10:00.000Z"
    const snapshot = makeProjectSnapshot({ timers: [makeTimer({ id: "timer-a", sharedAt })] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn(),
      },
      share: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({
          id: "share_123",
          data: { sharedAt, timerId: "timer-a" },
          createdAt: new Date(sharedAt),
          updatedAt: new Date(sharedAt),
        }),
      },
      timer: { updateMany: vi.fn() },
      webhookEvent: { create: vi.fn() },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "DELETE",
      publicApiRequest("DELETE", "/projects/project_123/shares/share_123"),
      ["projects", "project_123", "shares", "share_123"],
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
    expect(tx.webhookEvent.create).not.toHaveBeenCalled()
    expect(tx.timer.updateMany).not.toHaveBeenCalled()
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it("returns storage_unavailable when share deletes cannot sync the timer row", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const sharedAt = "2026-06-07T12:10:00.000Z"
    const snapshot = makeProjectSnapshot({ timers: [makeTimer({ id: "timer-a", sharedAt })] })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project_123" }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(projectRow(snapshot)),
        update: vi.fn(),
      },
      share: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({
          id: "share_123",
          data: { sharedAt, timerId: "timer-a" },
          createdAt: new Date(sharedAt),
          updatedAt: new Date(sharedAt),
        }),
      },
      timer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      webhookEvent: { create: vi.fn().mockResolvedValue({}) },
    }
    mockTransaction(tx)

    const res = await handlePublicApiV1Request(
      "DELETE",
      publicApiRequest("DELETE", "/projects/project_123/shares/share_123"),
      ["projects", "project_123", "shares", "share_123"],
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
    expect(tx.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "share.deleted" }),
    })
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it("creates webhook endpoints through the public API", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const count = vi.fn().mockResolvedValue(0)
    const create = vi.fn().mockImplementation(({ data }) =>
      webhookEndpointRow({
        eventTypes: data.eventTypes,
        name: data.name,
        secret: data.secret,
        url: data.url,
      }),
    )
    mocks.requirePrismaClient.mockReturnValue({ webhookEndpoint: { count, create } })

    const res = await handlePublicApiV1Request(
      "POST",
      publicApiRequest("POST", "/webhooks", {
        event_types: ["timer.ended"],
        name: "Production",
        url: "http://localhost/webhook",
      }),
      ["webhooks"],
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      event_types: ["timer.ended"],
      id: "wh_123",
      object: "webhook_endpoint",
      signing_secret: expect.stringMatching(/^whsec_/),
    })
    expect(count).toHaveBeenCalledWith({ where: { status: "active", userId: "user_123" } })
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventTypes: ["timer.ended"],
        name: "Production",
        secret: expect.stringMatching(/^whsec_/),
        url: "http://localhost/webhook",
        userId: "user_123",
      }),
    })
  })

  it("rejects invalid webhook create payloads before storage", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)

    const res = await handlePublicApiV1Request(
      "POST",
      publicApiRequest("POST", "/webhooks", { name: "", url: "http://example.com/webhook" }),
      ["webhooks"],
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("returns limit_exceeded when webhook endpoint creation reaches the active endpoint cap", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const create = vi.fn()
    mocks.requirePrismaClient.mockReturnValue({ webhookEndpoint: { count: vi.fn().mockResolvedValue(3), create } })

    const res = await handlePublicApiV1Request(
      "POST",
      publicApiRequest("POST", "/webhooks", { name: "Production", url: "http://localhost/webhook" }),
      ["webhooks"],
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "limit_exceeded" } })
    expect(create).not.toHaveBeenCalled()
  })

  it("removes webhook endpoints through the public API", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 })
    mocks.requirePrismaClient.mockReturnValue({ webhookEndpoint: { deleteMany } })

    const res = await handlePublicApiV1Request("DELETE", publicApiRequest("DELETE", "/webhooks/wh_123"), [
      "webhooks",
      "wh_123",
    ])

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ deleted: true, id: "wh_123", object: "webhook_endpoint" })
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "wh_123", userId: "user_123" } })
  })

  it("returns not_found when removing a missing webhook endpoint", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    mocks.requirePrismaClient.mockReturnValue({
      webhookEndpoint: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    })

    const res = await handlePublicApiV1Request("DELETE", publicApiRequest("DELETE", "/webhooks/wh_123"), [
      "webhooks",
      "wh_123",
    ])

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "not_found" } })
  })

  it("sends typed webhook test deliveries through the public API", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    const result = {
      object: "webhook_test",
      delivery: publicWebhookDelivery(),
      endpoint: publicWebhookEndpoint(),
    }
    mocks.sendTestWebhookForUser.mockResolvedValueOnce(result)

    const res = await handlePublicApiV1Request(
      "POST",
      publicApiRequest("POST", "/webhooks/wh_123/test", { event_type: "timer.ended" }),
      ["webhooks", "wh_123", "test"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(result)
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("webhook-test", "user:user_123:webhook:wh_123")
    expect(mocks.sendTestWebhookForUser).toHaveBeenCalledWith({
      eventType: "timer.ended",
      id: "wh_123",
      user: fullKey.user,
    })
  })

  it("rejects invalid webhook test payloads before sending", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)

    const res = await handlePublicApiV1Request(
      "POST",
      publicApiRequest("POST", "/webhooks/wh_123/test", { event_type: "nope.nope" }),
      ["webhooks", "wh_123", "test"],
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(mocks.sendTestWebhookForUser).not.toHaveBeenCalled()
  })

  it("returns not_found when a webhook test cannot find the endpoint", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.authenticateApiKey.mockResolvedValueOnce(fullKey)
    mocks.sendTestWebhookForUser.mockResolvedValueOnce(null)

    const res = await handlePublicApiV1Request("POST", publicApiRequest("POST", "/webhooks/wh_123/test"), [
      "webhooks",
      "wh_123",
      "test",
    ])

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "not_found" } })
  })

  it("lists webhook deliveries for an owned endpoint", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const endpointFindMany = vi.fn().mockResolvedValue([webhookEndpointRow()])
    const deliveryFindMany = vi.fn().mockResolvedValue([webhookDeliveryRow()])
    mocks.requirePrismaClient.mockReturnValue({
      webhookDelivery: { findMany: deliveryFindMany },
      webhookEndpoint: { findMany: endpointFindMany },
    })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/webhooks/wh_123/deliveries?limit=25", {
        headers: { authorization: "Bearer tw_read" },
      }),
      ["webhooks", "wh_123", "deliveries"],
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: [{ id: "wd_123", object: "webhook_delivery", status: "delivered" }],
      has_more: false,
      object: "list",
    })
    expect(endpointFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" }, where: { userId: "user_123" } }),
    )
    expect(deliveryFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 25,
      where: { endpointId: "wh_123", userId: "user_123" },
    })
  })

  it("rejects invalid webhook delivery list limits before storage", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/webhooks/wh_123/deliveries?limit=101", {
        headers: { authorization: "Bearer tw_read" },
      }),
      ["webhooks", "wh_123", "deliveries"],
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })

  it("returns not_found when listing deliveries for a missing webhook endpoint", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    const deliveryFindMany = vi.fn()
    mocks.requirePrismaClient.mockReturnValue({
      webhookDelivery: { findMany: deliveryFindMany },
      webhookEndpoint: { findMany: vi.fn().mockResolvedValue([]) },
    })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/webhooks/wh_123/deliveries", {
        headers: { authorization: "Bearer tw_read" },
      }),
      ["webhooks", "wh_123", "deliveries"],
    )

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "not_found" } })
    expect(deliveryFindMany).not.toHaveBeenCalled()
  })

  it("returns storage_unavailable when webhook delivery listing fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.requirePrismaClient.mockReturnValue({
      webhookDelivery: { findMany: vi.fn().mockRejectedValue(new Error("storage unavailable")) },
      webhookEndpoint: { findMany: vi.fn().mockResolvedValue([webhookEndpointRow()]) },
    })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/webhooks/wh_123/deliveries", {
        headers: { authorization: "Bearer tw_read" },
      }),
      ["webhooks", "wh_123", "deliveries"],
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "storage_unavailable" } })
    consoleError.mockRestore()
  })

  it("returns rate limit errors before hitting storage", async () => {
    const { handlePublicApiV1Request } = await import("./public-api-v1.server")
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, headers: { "retry-after": "30" } })

    const res = await handlePublicApiV1Request(
      "GET",
      new Request("https://tickward.test/api/v1/projects", { headers: { authorization: "Bearer tw_read" } }),
      ["projects"],
    )

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("30")
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "rate_limited",
        remediation: { hint: expect.any(String) },
        retryable: true,
        type: "rate_limited",
      },
    })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })
})

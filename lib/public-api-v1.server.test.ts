import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeProjectSnapshot } from "@/test/factories"

const mocks = vi.hoisted(() => ({
  authenticateApiKey: vi.fn(),
  checkRateLimit: vi.fn(),
  requirePrismaClient: vi.fn(),
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

function idempotencyCacheKey(data: { apiKeyId: string; keyHash: string }) {
  return `${data.apiKeyId}:${data.keyHash}`
}

function idempotencyWhereKey(where: { apiKeyId_keyHash: { apiKeyId: string; keyHash: string } }) {
  return `${where.apiKeyId_keyHash.apiKeyId}:${where.apiKeyId_keyHash.keyHash}`
}

describe("public API v1", () => {
  beforeEach(() => {
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
    mocks.requirePrismaClient.mockReturnValue({
      project: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    })
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
        mcp: { local_stdio: true, remote_http: false },
        nested_project_create: true,
        project_preview: true,
      },
      limits: { page_size_max: 100 },
      object: "capabilities",
    })
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
    expect(mocks.authenticateApiKey).not.toHaveBeenCalled()
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
      summary: {
        projects: { delete: 1 },
        share_links: { delete: 2 },
        spaces: { delete: 1 },
        timers: { delete: 1 },
      },
      target: { id: "project_123", type: "project" },
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
        { action: "delete", id: "space-a", type: "space" },
        { action: "update", id: "timer-a", reason: "space_removed", type: "timer" },
      ],
      operation: "delete_space",
      summary: {
        share_links: { delete: 0 },
        spaces: { delete: 1 },
        timers: { update: 1 },
      },
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
          target_date: "2026-12-01T10:00:00.000Z",
          timezone: "UTC",
        }),
      }),
      ["projects", "project_123", "timers"],
    )

    expect(res.status).toBe(201)
    const queryText = Array.from(tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?")
    expect(queryText).toContain("FOR UPDATE")
    expect(tx.timer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "project_123", ownerId: "user_123" }) }),
    )
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snapshot: expect.anything() }),
        where: { id: "project_123" },
      }),
    )
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

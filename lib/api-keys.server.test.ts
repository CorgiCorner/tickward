import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/audit-log.server", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

import {
  API_KEY_PREFIX,
  createApiKeyForUser,
  createApiKeyToken,
  hashApiKeyToken,
  normalizeApiKeyName,
  normalizeApiKeyPermission,
  readBearerApiKey,
  revokeApiKeyForUser,
} from "@/lib/api-keys.server"

describe("api key helpers", () => {
  beforeEach(() => {
    mocks.recordAuditEvent.mockReset()
    mocks.requirePrismaClient.mockReset()
  })

  it("generates prefixed secrets and stores only deterministic hashes", () => {
    const token = createApiKeyToken()

    expect(token.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(hashApiKeyToken(token)).toHaveLength(64)
    expect(hashApiKeyToken(token)).toBe(hashApiKeyToken(token))
    expect(hashApiKeyToken(token)).not.toContain(token)
  })

  it("preserves the domain-separated hash used by existing credentials", () => {
    expect(hashApiKeyToken("tw_compatibility_fixture_2026")).toBe(
      "51ca99dc5571c58cf5690ae7cf7753199370d9f8b985552fa0f32907941d9dc3",
    )
  })

  it("normalizes public API key permissions and names", () => {
    expect(normalizeApiKeyPermission("read")).toBe("read")
    expect(normalizeApiKeyPermission("full_access")).toBe("full_access")
    expect(normalizeApiKeyPermission("write")).toBeNull()

    expect(normalizeApiKeyName(" Production ")).toBe("Production")
    expect(normalizeApiKeyName("")).toBeNull()
    expect(normalizeApiKeyName("x".repeat(81))).toBeNull()
  })

  it("reads bearer tokens from authorization headers", () => {
    expect(
      readBearerApiKey(new Request("https://tickward.test", { headers: { authorization: "Bearer tw_123" } })),
    ).toBe("tw_123")
    expect(
      readBearerApiKey(new Request("https://tickward.test", { headers: { authorization: "Basic nope" } })),
    ).toBeNull()
    expect(readBearerApiKey(new Request("https://tickward.test"))).toBeNull()
  })

  it("emits an audit event when an API key is created", async () => {
    const createdAt = new Date("2026-07-07T20:00:00.000Z")
    const tx = {
      apiKey: {
        create: vi.fn(async ({ data }) => ({
          ...data,
          createdAt,
          id: "key_123",
          lastUsedAt: null,
          revokedAt: null,
          updatedAt: createdAt,
        })),
      },
      user: { upsert: vi.fn().mockResolvedValue({}) },
    }
    mocks.requirePrismaClient.mockReturnValue({
      $transaction: (fn: (txArg: typeof tx) => unknown) => fn(tx),
    })

    const result = await createApiKeyForUser({
      name: "Production",
      permission: "read",
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })

    expect(result.token).toMatch(/^tw_/)
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "api_key.created",
      actorEmail: "ada@example.com",
      actorId: "user_123",
      metadata: { key_prefix: expect.stringMatching(/^tw_/), permission: "read" },
      targetId: "key_123",
      targetType: "api_key",
    })
    expect(JSON.stringify(mocks.recordAuditEvent.mock.calls[0]?.[0])).not.toContain(result.token)
  })

  it("emits an audit event when an API key is revoked", async () => {
    const updatedAt = new Date("2026-07-07T20:00:00.000Z")
    mocks.requirePrismaClient.mockReturnValue({
      apiKey: {
        updateManyAndReturn: vi.fn().mockResolvedValue([
          {
            createdAt: updatedAt,
            id: "key_123",
            keyLast4: "abcd",
            keyPrefix: "tw_test",
            lastUsedAt: null,
            name: "Production",
            permission: "read",
            revokedAt: updatedAt,
            updatedAt,
          },
        ]),
      },
    })

    await expect(
      revokeApiKeyForUser({ id: "key_123", user: { email: "ada@example.com", id: "user_123" } }),
    ).resolves.toMatchObject({ id: "key_123", revoked_at: updatedAt.toISOString() })

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "api_key.revoked",
      actorEmail: "ada@example.com",
      actorId: "user_123",
      metadata: { key_prefix: "tw_test", permission: "read" },
      targetId: "key_123",
      targetType: "api_key",
    })
  })
})

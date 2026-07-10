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

describe("MCP OAuth storage", () => {
  beforeEach(() => {
    mocks.recordAuditEvent.mockReset()
    mocks.requirePrismaClient.mockReset()
  })

  it("exchanges one-time grants for scoped MCP credentials", async () => {
    const { MCP_CREDENTIAL_KIND } = await import("@/lib/api-keys.server")
    const { MCP_CONNECTION_TOKEN_PREFIX } = await import("@/lib/mcp-oauth")
    const { exchangeMcpAuthorizationGrant } = await import("@/lib/mcp-oauth.server")
    const grant = {
      clientName: "Claude Code",
      expiresAt: new Date(Date.now() + 60_000),
      id: "grant_123",
      mcpOrigin: "https://mcp.tickward.test",
      scopes: ["projects:read", "timers:write"],
      tokenHash: "hash",
      usedAt: null,
      user: { email: "ada@example.com", id: "user_123", role: "user" },
      userId: "user_123",
    }
    const created = {
      clientName: "Claude Code",
      createdAt: new Date("2026-06-07T22:42:00.000Z"),
      id: "credential_123",
      keyLast4: "last",
      keyPrefix: "tw_mcp_abc123",
      lastUsedAt: null,
      name: "MCP: Claude Code",
      permission: "full_access",
      revokedAt: null,
      scopes: ["projects:read", "timers:write"],
      updatedAt: new Date("2026-06-07T22:42:00.000Z"),
    }
    const tx = {
      apiKey: { create: vi.fn().mockResolvedValue(created) },
      mcpAuthorizationGrant: {
        findUnique: vi.fn().mockResolvedValue(grant),
        update: vi.fn().mockResolvedValue({ ...grant, usedAt: new Date() }),
      },
    }
    mocks.requirePrismaClient.mockReturnValue({
      $transaction: (fn: (txArg: typeof tx) => unknown) => fn(tx),
      mcpAuthorizationGrant: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    })

    const result = await exchangeMcpAuthorizationGrant("mcpg_secret")

    expect(result?.token.startsWith(MCP_CONNECTION_TOKEN_PREFIX)).toBe(true)
    expect(result?.connection).toMatchObject({
      client_name: "Claude Code",
      object: "mcp_connection",
      permission: "full_access",
      scopes: ["projects:read", "timers:write"],
    })
    expect(tx.mcpAuthorizationGrant.update).toHaveBeenCalledWith({
      data: { usedAt: expect.any(Date) },
      where: { id: "grant_123" },
    })
    expect(tx.apiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientName: "Claude Code",
        kind: MCP_CREDENTIAL_KIND,
        name: "MCP: Claude Code",
        permission: "full_access",
        scopes: ["projects:read", "timers:write"],
        userId: "user_123",
      }),
    })
  })

  it("rejects used grants", async () => {
    const { exchangeMcpAuthorizationGrant } = await import("@/lib/mcp-oauth.server")
    const tx = {
      apiKey: { create: vi.fn() },
      mcpAuthorizationGrant: {
        findUnique: vi.fn().mockResolvedValue({
          expiresAt: new Date(Date.now() + 60_000),
          id: "grant_123",
          scopes: ["projects:read"],
          usedAt: new Date(),
        }),
        update: vi.fn(),
      },
    }
    mocks.requirePrismaClient.mockReturnValue({
      $transaction: (fn: (txArg: typeof tx) => unknown) => fn(tx),
      mcpAuthorizationGrant: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    })

    await expect(exchangeMcpAuthorizationGrant("mcpg_secret")).resolves.toBeNull()
    expect(tx.apiKey.create).not.toHaveBeenCalled()
  })

  it("emits an audit event when an MCP connection is revoked", async () => {
    const { revokeMcpConnectionForUser } = await import("@/lib/mcp-oauth.server")
    const updatedAt = new Date("2026-07-07T20:00:00.000Z")
    mocks.requirePrismaClient.mockReturnValue({
      apiKey: {
        updateManyAndReturn: vi.fn().mockResolvedValue([
          {
            clientName: "Desktop",
            createdAt: updatedAt,
            id: "connection_123",
            keyLast4: "last",
            keyPrefix: "tw_mcp_test",
            lastUsedAt: null,
            name: "MCP: Desktop",
            permission: "read",
            revokedAt: updatedAt,
            scopes: ["projects:read"],
            updatedAt,
          },
        ]),
      },
    })

    await expect(
      revokeMcpConnectionForUser({
        id: "connection_123",
        user: { email: "ada@example.com", id: "user_123", role: "user" },
      }),
    ).resolves.toMatchObject({ id: "connection_123", object: "mcp_connection" })

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "mcp.connection.revoked",
      actorEmail: "ada@example.com",
      actorId: "user_123",
      metadata: {
        client_name: "Desktop",
        key_prefix: "tw_mcp_test",
        scopes: ["projects:read"],
      },
      targetId: "connection_123",
      targetType: "mcp_connection",
    })
  })
})

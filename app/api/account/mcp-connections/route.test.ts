import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  listMcpConnectionsForUser: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/mcp-oauth.server", () => ({
  listMcpConnectionsForUser: mocks.listMcpConnectionsForUser,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

describe("/api/account/mcp-connections", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue({
      kind: "user",
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })
    mocks.listMcpConnectionsForUser.mockReset()
    mocks.listMcpConnectionsForUser.mockResolvedValue([{ id: "connection_123", object: "mcp_connection" }])
  })

  it("lists MCP connections for the signed-in user", async () => {
    const { GET } = await import("./route")

    const res = await GET(new Request("https://tickward.test/api/account/mcp-connections"))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: [{ id: "connection_123", object: "mcp_connection" }],
      object: "list",
    })
    expect(mocks.listMcpConnectionsForUser).toHaveBeenCalledWith({
      email: "ada@example.com",
      id: "user_123",
      role: "user",
    })
  })
})

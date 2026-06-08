import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  revokeMcpConnectionForUser: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/mcp-oauth.server", () => ({
  revokeMcpConnectionForUser: mocks.revokeMcpConnectionForUser,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

describe("/api/account/mcp-connections/[id]", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue({
      kind: "user",
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })
    mocks.revokeMcpConnectionForUser.mockReset()
    mocks.revokeMcpConnectionForUser.mockResolvedValue({ id: "connection_123", object: "mcp_connection" })
  })

  it("revokes an MCP connection for the signed-in user", async () => {
    const { DELETE } = await import("./route")

    const res = await DELETE(new Request("https://tickward.test/api/account/mcp-connections/connection_123"), {
      params: Promise.resolve({ id: "connection_123" }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ deleted: true, id: "connection_123", object: "mcp_connection" })
    expect(mocks.revokeMcpConnectionForUser).toHaveBeenCalledWith({
      id: "connection_123",
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })
  })
})

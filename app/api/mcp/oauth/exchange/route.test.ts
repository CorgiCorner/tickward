import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  exchangeMcpAuthorizationGrant: vi.fn(),
}))

vi.mock("@/lib/mcp-oauth.server", () => ({
  exchangeMcpAuthorizationGrant: mocks.exchangeMcpAuthorizationGrant,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

describe("/api/mcp/oauth/exchange", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })
    mocks.exchangeMcpAuthorizationGrant.mockReset()
  })

  it("exchanges a valid one-time grant", async () => {
    mocks.exchangeMcpAuthorizationGrant.mockResolvedValue({
      connection: {
        client_name: "Claude Code",
        id: "connection_123",
        object: "mcp_connection",
        scopes: ["projects:read"],
      },
      token: "tw_mcp_secret",
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/mcp/oauth/exchange", {
        body: JSON.stringify({ grant: "mcpg_secret" }),
        method: "POST",
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      object: "mcp_oauth_exchange",
      token: "tw_mcp_secret",
      user: { id: "user_123" },
    })
    expect(mocks.exchangeMcpAuthorizationGrant).toHaveBeenCalledWith("mcpg_secret")
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "mcp-oauth-exchange",
      expect.stringMatching(/^grant:[a-f0-9]{32}$/),
    )
  })

  it("rejects invalid grants", async () => {
    mocks.exchangeMcpAuthorizationGrant.mockResolvedValue(null)
    const { POST } = await import("./route")

    const res = await POST(
      new Request("https://tickward.test/api/mcp/oauth/exchange", {
        body: JSON.stringify({ grant: "mcpg_bad" }),
        method: "POST",
      }),
    )

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "unauthorized" } })
  })
})

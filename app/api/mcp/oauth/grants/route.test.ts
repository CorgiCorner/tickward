import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createMcpAuthorizationGrantForUser: vi.fn(),
  getCurrentActor: vi.fn(),
  readMcpAuthorizationHandoff: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/mcp-authorization-handoff.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp-authorization-handoff.server")>()),
  readMcpAuthorizationHandoff: mocks.readMcpAuthorizationHandoff,
}))

vi.mock("@/lib/mcp-oauth.server", () => ({
  createMcpAuthorizationGrantForUser: mocks.createMcpAuthorizationGrantForUser,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

describe("/api/mcp/oauth/grants", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })
    mocks.createMcpAuthorizationGrantForUser.mockReset()
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue({
      kind: "user",
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })
    mocks.readMcpAuthorizationHandoff.mockReset()
    mocks.readMcpAuthorizationHandoff.mockResolvedValue({
      clientName: "Claude Code",
      handoff: "handoff_1234567890",
      mcpOrigin: "https://mcp.tickward.test",
      scopes: ["projects:read", "timers:write"],
    })
    mocks.createMcpAuthorizationGrantForUser.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      grantToken: "mcpg_secret",
    })
  })

  it("creates a one-time grant and redirects back to the MCP worker", async () => {
    const { POST } = await import("./route")
    const body = new FormData()
    body.set("handoff", "handoff_1234567890")
    body.set("mcp_origin", "https://mcp.tickward.test")

    const res = await POST(new Request("https://tickward.test/api/mcp/oauth/grants", { body, method: "POST" }))

    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(
      "https://mcp.tickward.test/authorize/callback?handoff=handoff_1234567890&grant=mcpg_secret",
    )
    expect(mocks.createMcpAuthorizationGrantForUser).toHaveBeenCalledWith({
      clientName: "Claude Code",
      mcpOrigin: "https://mcp.tickward.test",
      scopes: ["projects:read", "timers:write"],
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })
  })

  it("treats a non-string mcp_origin form value as absent instead of stringifying it", async () => {
    const { POST } = await import("./route")
    const body = new FormData()
    body.set("handoff", "handoff_1234567890")
    body.set("mcp_origin", new Blob(["https://mcp.tickward.test"]))

    const res = await POST(new Request("https://tickward.test/api/mcp/oauth/grants", { body, method: "POST" }))

    expect(res.status).toBe(303)
    expect(mocks.readMcpAuthorizationHandoff).toHaveBeenCalledWith({ handoff: "handoff_1234567890", mcpOrigin: "" })
  })

  it("requires a signed-in user", async () => {
    mocks.getCurrentActor.mockResolvedValueOnce({ kind: "anonymous" })
    const { POST } = await import("./route")
    const body = new FormData()
    body.set("handoff", "handoff_1234567890")
    body.set("mcp_origin", "https://mcp.tickward.test")

    const res = await POST(new Request("https://tickward.test/api/mcp/oauth/grants", { body, method: "POST" }))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "unauthorized" } })
  })
})

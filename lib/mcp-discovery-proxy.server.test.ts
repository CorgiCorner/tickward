import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getMcpRemoteUrl: vi.fn(),
}))

vi.mock("@/lib/mcp-config.server", () => ({
  getMcpRemoteUrl: mocks.getMcpRemoteUrl,
}))

const fetchMock = vi.fn()

describe("proxyMcpDiscovery", () => {
  beforeEach(() => {
    mocks.getMcpRemoteUrl.mockReturnValue("https://mcp.tickward.test/mcp")
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("serves the upstream document verbatim by default", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ resource: "https://mcp.tickward.test" }), {
        headers: { "content-type": "application/json" },
      }),
    )

    const { proxyMcpDiscovery } = await import("@/lib/mcp-discovery-proxy.server")
    const response = await proxyMcpDiscovery("/.well-known/oauth-protected-resource")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://mcp.tickward.test/.well-known/oauth-protected-resource",
      expect.objectContaining({ cache: "no-store" }),
    )
    await expect(response.json()).resolves.toEqual({ resource: "https://mcp.tickward.test" })
  })

  it("applies transformJson to JSON documents", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          resource: "https://mcp.tickward.test",
          authorization_servers: ["https://mcp.tickward.test"],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    )

    const { proxyMcpDiscovery } = await import("@/lib/mcp-discovery-proxy.server")
    const response = await proxyMcpDiscovery("/.well-known/oauth-protected-resource", {
      transformJson: (document) => ({ ...document, resource: "https://tickward.test" }),
    })

    await expect(response.json()).resolves.toEqual({
      resource: "https://tickward.test",
      authorization_servers: ["https://mcp.tickward.test"],
    })
  })

  it("returns 404 when no MCP remote is configured", async () => {
    mocks.getMcpRemoteUrl.mockReturnValue(null)

    const { proxyMcpDiscovery } = await import("@/lib/mcp-discovery-proxy.server")
    const response = await proxyMcpDiscovery("/.well-known/oauth-protected-resource")

    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the upstream document is missing", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }))

    const { proxyMcpDiscovery } = await import("@/lib/mcp-discovery-proxy.server")
    const response = await proxyMcpDiscovery("/.well-known/oauth-protected-resource")

    expect(response.status).toBe(404)
  })
})

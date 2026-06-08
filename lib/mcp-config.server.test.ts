import { afterEach, describe, expect, it } from "vitest"

import { getMcpRemoteUrl } from "@/lib/mcp-config.server"

const originalMcpRemoteUrl = process.env.TICKWARD_MCP_REMOTE_URL

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

describe("mcp config", () => {
  afterEach(() => {
    restoreEnv("TICKWARD_MCP_REMOTE_URL", originalMcpRemoteUrl)
  })

  it("returns null when remote MCP is not configured", () => {
    delete process.env.TICKWARD_MCP_REMOTE_URL

    expect(getMcpRemoteUrl()).toBeNull()
  })

  it("returns the normalized remote MCP URL", () => {
    process.env.TICKWARD_MCP_REMOTE_URL = "https://mcp.example.com/mcp"

    expect(getMcpRemoteUrl()).toBe("https://mcp.example.com/mcp")
  })

  it("ignores invalid remote MCP URLs", () => {
    process.env.TICKWARD_MCP_REMOTE_URL = "ftp://mcp.example.com/mcp"

    expect(getMcpRemoteUrl()).toBeNull()
  })
})

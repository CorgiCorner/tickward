import { afterEach, describe, expect, it, vi } from "vitest"

import {
  WEBMCP_TOOL_DEFINITIONS,
  type WebMcpTool,
  type WebMcpToolResult,
  webMcpInlineScript,
} from "@/components/webmcp-inline-script"

function setModelContext(value: unknown) {
  Object.defineProperty(navigator, "modelContext", { configurable: true, value })
}

function runInlineScript() {
  // biome-ignore lint/security/noGlobalEval: the test executes the generated inline script exactly like a browser would
  ;(0, eval)(webMcpInlineScript())
}

describe("webMcpInlineScript", () => {
  afterEach(() => {
    // biome-ignore lint/performance/noDelete: restore the pristine globals between tests
    delete (navigator as Navigator & { modelContext?: unknown }).modelContext
    delete window.__tickwardWebMcp
    delete window.__tickwardWebMcpRegistered
    window.history.replaceState(null, "", "/")
    vi.useRealTimers()
  })

  it("registers each tool through registerTool while the document parses", () => {
    const registered: WebMcpTool[] = []
    setModelContext({ registerTool: (tool: WebMcpTool) => registered.push(tool) })

    runInlineScript()

    expect(registered.map((tool) => tool.name)).toEqual(WEBMCP_TOOL_DEFINITIONS.map((tool) => tool.name))
    for (const tool of registered) {
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema).toMatchObject({ type: "object" })
      expect(tool.annotations).toEqual({ readOnlyHint: true })
    }
    expect(window.__tickwardWebMcpRegistered).toBe(true)
  })

  it("falls back to provideContext when registerTool is unavailable", () => {
    const provideContext = vi.fn()
    setModelContext({ provideContext })

    runInlineScript()

    expect(provideContext).toHaveBeenCalledTimes(1)
    const { tools } = provideContext.mock.calls[0][0] as { tools: WebMcpTool[] }
    expect(tools.map((tool) => tool.name)).toEqual(WEBMCP_TOOL_DEFINITIONS.map((tool) => tool.name))
    expect(window.__tickwardWebMcpRegistered).toBe(true)
  })

  it("does nothing when modelContext is absent or tools were already registered", () => {
    expect(() => runInlineScript()).not.toThrow()
    expect(window.__tickwardWebMcpRegistered).toBeUndefined()

    const registerTool = vi.fn()
    setModelContext({ registerTool })
    window.__tickwardWebMcpRegistered = true

    runInlineScript()

    expect(registerTool).not.toHaveBeenCalled()
  })

  it("does nothing outside the homepage", () => {
    window.history.replaceState(null, "", "/settings")
    const registerTool = vi.fn()
    setModelContext({ registerTool })

    runInlineScript()

    expect(registerTool).not.toHaveBeenCalled()
    expect(window.__tickwardWebMcpRegistered).toBeUndefined()
  })

  it("forwards execute calls to the client bridge when it is ready", () => {
    const registered: WebMcpTool[] = []
    setModelContext({ registerTool: (tool: WebMcpTool) => registered.push(tool) })
    const execute = vi.fn((name: string): WebMcpToolResult => ({ content: [{ type: "text", text: `ran ${name}` }] }))
    window.__tickwardWebMcp = { execute }

    runInlineScript()
    const result = registered[0].execute({ include_archived: true })

    expect(execute).toHaveBeenCalledWith("list_timers", { include_archived: true })
    expect(result).toEqual({ content: [{ type: "text", text: "ran list_timers" }] })
  })

  it("waits for the client bridge to hydrate before executing", async () => {
    vi.useFakeTimers()
    const registered: WebMcpTool[] = []
    setModelContext({ registerTool: (tool: WebMcpTool) => registered.push(tool) })

    runInlineScript()
    const pending = registered[1].execute() as Promise<WebMcpToolResult>

    const execute = vi.fn((name: string): WebMcpToolResult => ({ content: [{ type: "text", text: `ran ${name}` }] }))
    window.__tickwardWebMcp = { execute }
    await vi.advanceTimersByTimeAsync(1_000)

    expect(await pending).toEqual({ content: [{ type: "text", text: "ran get_project_overview" }] })
    expect(execute).toHaveBeenCalledWith("get_project_overview", undefined)
  })

  it("resolves with a retry message when the bridge never hydrates", async () => {
    vi.useFakeTimers()
    const registered: WebMcpTool[] = []
    setModelContext({ registerTool: (tool: WebMcpTool) => registered.push(tool) })

    runInlineScript()
    const pending = registered[0].execute() as Promise<WebMcpToolResult>
    await vi.advanceTimersByTimeAsync(11_000)

    const result = await pending
    expect(result.content[0].text).toContain("still loading")
  })
})

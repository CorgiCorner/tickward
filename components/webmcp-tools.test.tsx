import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WebMcpTools } from "@/components/webmcp-tools"
import type { TimerStore } from "@/lib/store"
import { makeSpace, makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

type RegisteredTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args?: unknown) => { content: Array<{ type: string; text: string }> }
}

function setModelContext(value: unknown) {
  Object.defineProperty(navigator, "modelContext", { configurable: true, value })
}

function clearModelContext() {
  // biome-ignore lint/performance/noDelete: restore the pristine navigator between tests
  delete (navigator as Navigator & { modelContext?: unknown }).modelContext
}

describe("WebMcpTools", () => {
  beforeEach(() => {
    storeState = {
      timers: [
        makeTimer({ id: "timer-a", label: "Launch" }),
        makeTimer({ id: "timer-b", label: "Old", archivedAt: "2026-05-21T00:00:00.000Z" }),
      ],
      spaces: [makeSpace()],
      projects: [{ id: "project-a", name: "Side quests" }] as TimerStore["projects"],
      activeProjectId: "project-a",
    }
  })

  afterEach(() => {
    clearModelContext()
    // biome-ignore lint/performance/noDelete: restore the pristine globals between tests
    delete window.__tickwardWebMcp
    // biome-ignore lint/performance/noDelete: restore the pristine globals between tests
    delete window.__tickwardWebMcpRegistered
    vi.useRealTimers()
  })

  it("registers each tool through registerTool when available", () => {
    const registered: RegisteredTool[] = []
    setModelContext({ registerTool: (tool: RegisteredTool) => registered.push(tool) })

    render(<WebMcpTools />)

    expect(registered.map((tool) => tool.name)).toEqual(["list_timers", "get_project_overview"])
    for (const tool of registered) {
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema).toMatchObject({ type: "object" })
    }

    const listResult = registered[0].execute()
    const payload = JSON.parse(listResult.content[0].text) as { count: number; timers: Array<{ label: string }> }
    expect(payload.count).toBe(1)
    expect(payload.timers[0].label).toBe("Launch")

    const overview = JSON.parse(registered[1].execute().content[0].text) as Record<string, unknown>
    expect(overview).toMatchObject({
      project: "Side quests",
      active_timer_count: 1,
      archived_timer_count: 1,
      spaces: ["Work"],
    })
  })

  it("falls back to provideContext when registerTool is unavailable", () => {
    const provideContext = vi.fn()
    setModelContext({ provideContext })

    render(<WebMcpTools />)

    expect(provideContext).toHaveBeenCalledTimes(1)
    const { tools } = provideContext.mock.calls[0][0] as { tools: RegisteredTool[] }
    expect(tools.map((tool) => tool.name)).toEqual(["list_timers", "get_project_overview"])
  })

  it("registers tools when modelContext is attached after mount", () => {
    vi.useFakeTimers()
    const registered: RegisteredTool[] = []

    render(<WebMcpTools />)
    expect(registered).toHaveLength(0)

    setModelContext({ registerTool: (tool: RegisteredTool) => registered.push(tool) })
    vi.advanceTimersByTime(1_000)

    expect(registered.map((tool) => tool.name)).toEqual(["list_timers", "get_project_overview"])
  })

  it("installs the inline-script bridge and clears it on unmount", () => {
    const { unmount } = render(<WebMcpTools />)

    const bridge = window.__tickwardWebMcp
    expect(bridge?.execute).toBeTypeOf("function")

    const listResult = bridge?.execute?.("list_timers", { include_archived: true })
    const payload = JSON.parse(listResult?.content[0].text ?? "{}") as { count: number }
    expect(payload.count).toBe(2)

    const unknown = bridge?.execute?.("does_not_exist")
    expect(unknown?.content[0].text).toContain("Unknown tool")

    unmount()
    expect(window.__tickwardWebMcp?.execute).toBeNull()
  })

  it("skips re-registration when the inline script already registered the tools", () => {
    window.__tickwardWebMcpRegistered = true
    const registerTool = vi.fn()
    setModelContext({ registerTool })

    render(<WebMcpTools />)

    expect(registerTool).not.toHaveBeenCalled()
    expect(window.__tickwardWebMcp?.execute).toBeTypeOf("function")
  })

  it("unregisters tools on unmount when registrations expose unregister", () => {
    const unregister = vi.fn()
    setModelContext({ registerTool: () => ({ unregister }) })

    const { unmount } = render(<WebMcpTools />)
    unmount()

    expect(unregister).toHaveBeenCalledTimes(2)
  })
})

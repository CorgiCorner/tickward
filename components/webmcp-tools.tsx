"use client"

import { useEffect, useRef } from "react"

import {
  WEBMCP_TOOL_DEFINITIONS,
  type WebMcpBridge,
  type WebMcpTool,
  type WebMcpToolResult,
} from "@/components/webmcp-inline-script"
import { useTimerStore } from "@/lib/store"

type ModelContext = {
  provideContext?: (context: { tools: WebMcpTool[] }) => void
  registerTool?: (tool: WebMcpTool) => unknown
}

const MODEL_CONTEXT_POLL_INTERVAL_MS = 500
const MODEL_CONTEXT_POLL_BUDGET_MS = 15_000

function getModelContext(): ModelContext | undefined {
  return (navigator as Navigator & { modelContext?: ModelContext }).modelContext
}

function textResult(payload: unknown): WebMcpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] }
}

/**
 * Executes the read-only WebMCP tools registered by the inline script in
 * `webMcpInlineScript` and re-registers them when an agent attaches
 * `navigator.modelContext` only after the page has loaded. No mutating actions
 * are exposed.
 */
export function WebMcpTools() {
  const timers = useTimerStore((store) => store.timers)
  const spaces = useTimerStore((store) => store.spaces)
  const projectName = useTimerStore(
    (store) => store.projects.find((project) => project.id === store.activeProjectId)?.name ?? null,
  )

  // Keep the latest snapshot in a ref so tools registered once on mount always
  // return current data without re-registering on every store change.
  const snapshotRef = useRef({ timers, spaces, projectName })
  useEffect(() => {
    snapshotRef.current = { timers, spaces, projectName }
  })

  useEffect(() => {
    const executeTool = (name: string, args?: unknown): WebMcpToolResult => {
      if (name === "list_timers") {
        const includeArchived = Boolean((args as { include_archived?: unknown } | undefined)?.include_archived)
        const snapshot = snapshotRef.current
        const spaceNameById = new Map(snapshot.spaces.map((space) => [space.id, space.name]))
        const timerList = snapshot.timers
          .filter((timer) => includeArchived || !timer.archivedAt)
          .map((timer) => ({
            label: timer.label,
            target_date: timer.targetDate,
            timezone: timer.timezone,
            recurring: timer.recurrence?.enabled ? timer.recurrence.type : null,
            archived: Boolean(timer.archivedAt),
            space: timer.spaceId ? (spaceNameById.get(timer.spaceId) ?? null) : null,
          }))

        return textResult({ project: snapshot.projectName, count: timerList.length, timers: timerList })
      }

      if (name === "get_project_overview") {
        const snapshot = snapshotRef.current
        const activeTimers = snapshot.timers.filter((timer) => !timer.archivedAt)
        const upcoming = activeTimers
          .map((timer) => ({ label: timer.label, target_date: timer.targetDate, timezone: timer.timezone }))
          .filter((timer) => Date.parse(timer.target_date) > Date.now())
          .sort((a, b) => Date.parse(a.target_date) - Date.parse(b.target_date))

        return textResult({
          project: snapshot.projectName,
          spaces: snapshot.spaces.map((space) => space.name),
          active_timer_count: activeTimers.length,
          archived_timer_count: snapshot.timers.length - activeTimers.length,
          next_deadline: upcoming[0] ?? null,
        })
      }

      return textResult({ error: `Unknown tool: ${name}` })
    }

    const bridge: WebMcpBridge = { execute: executeTool }
    window.__tickwardWebMcp = bridge

    const tools: WebMcpTool[] = WEBMCP_TOOL_DEFINITIONS.map((definition) => ({
      ...definition,
      annotations: { readOnlyHint: true },
      execute: (args?: unknown) => executeTool(definition.name, args),
    }))

    let cancelled = false
    let pollTimer: number | undefined
    const unregisterCallbacks: Array<() => void> = []

    const registerWith = (modelContext: ModelContext) => {
      try {
        if (typeof modelContext.registerTool === "function") {
          for (const tool of tools) {
            const registration = modelContext.registerTool(tool)
            const unregister = (registration as { unregister?: unknown } | null | undefined)?.unregister
            if (typeof unregister === "function") {
              unregisterCallbacks.push(() => (unregister as () => void).call(registration))
            }
          }
        } else if (typeof modelContext.provideContext === "function") {
          modelContext.provideContext({ tools })
        }
      } catch {
        // WebMCP is experimental; never let a registration failure break the page.
      }
    }

    const tryRegister = () => {
      if (cancelled) return true
      // The inline script already registered the tools while the document was
      // parsing; registering again here would duplicate them.
      if (window.__tickwardWebMcpRegistered) return true
      const modelContext = getModelContext()
      if (!modelContext) return false
      registerWith(modelContext)
      return true
    }

    if (!tryRegister()) {
      // The API (or an agent's injected recorder) can be attached after our
      // mount effect runs, so keep checking briefly instead of giving up.
      const startedAt = Date.now()
      pollTimer = window.setInterval(() => {
        if (tryRegister() || Date.now() - startedAt > MODEL_CONTEXT_POLL_BUDGET_MS) {
          window.clearInterval(pollTimer)
        }
      }, MODEL_CONTEXT_POLL_INTERVAL_MS)
    }

    return () => {
      cancelled = true
      if (pollTimer !== undefined) window.clearInterval(pollTimer)
      if (window.__tickwardWebMcp === bridge) {
        bridge.execute = null
      }
      for (const unregister of unregisterCallbacks) {
        try {
          unregister()
        } catch {
          // Ignore teardown failures from experimental implementations.
        }
      }
    }
  }, [])

  return null
}

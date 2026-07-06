"use client"

import { useEffect, useRef } from "react"

import { useTimerStore } from "@/lib/store"

const PROJECT_PARAM = "project"

// Mirrors the active project in a ?project= query param on the main app page.
// The param carries the cloud project id when the project is synced (the same
// id the public API and MCP use), falling back to the local project id for
// anonymous projects so tab restores and same-device links still resolve.
export function useProjectUrlSync() {
  const hasHydrated = useTimerStore((s) => s.hasHydrated)
  const projects = useTimerStore((s) => s.projects)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const switchProject = useTimerStore((s) => s.switchProject)
  const adoptedRef = useRef(false)

  useEffect(() => {
    if (!hasHydrated || adoptedRef.current) return
    adoptedRef.current = true
    const param = new URLSearchParams(window.location.search).get(PROJECT_PARAM)
    if (!param) return
    const match = projects.find((project) => project.cloudProjectId === param || project.id === param)
    if (match && match.id !== activeProjectId) switchProject(match.id)
  }, [hasHydrated, projects, activeProjectId, switchProject])

  useEffect(() => {
    if (!hasHydrated || !adoptedRef.current) return
    const active = projects.find((project) => project.id === activeProjectId)
    const value = active ? (active.cloudProjectId ?? active.id) : null
    const url = new URL(window.location.href)
    if (value) {
      url.searchParams.set(PROJECT_PARAM, value)
    } else {
      url.searchParams.delete(PROJECT_PARAM)
    }
    if (url.toString() !== window.location.href) {
      window.history.replaceState(window.history.state, "", url)
    }
  }, [hasHydrated, projects, activeProjectId])
}

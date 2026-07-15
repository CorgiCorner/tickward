"use client"

import { useEffect, useRef } from "react"

import type { ProjectMeta } from "@/lib/project-model"
import { useTimerStore } from "@/lib/store"
import { UNASSIGNED_SPACE_ID, type Space } from "@/lib/types"

const PROJECT_PARAM = "project"
const SPACE_PARAM = "space"

function spaceSelectionFromParam(spaceParam: string | null, spaces: ReadonlyArray<{ id: string }>) {
  if (!spaceParam) return undefined
  if (spaceParam === UNASSIGNED_SPACE_ID || spaces.some((space) => space.id === spaceParam)) return spaceParam
  return null
}

function projectSelectionFromParam(projectParam: string | null, projects: ReadonlyArray<ProjectMeta>) {
  if (!projectParam) return undefined
  return projects.find((project) => project.cloudProjectId === projectParam || project.id === projectParam)
}

type InitialSelection = {
  activeProjectId: string | null
  activeSpaceId: string | null
  projects: ReadonlyArray<ProjectMeta>
  spaces: ReadonlyArray<Space>
  switchProject: (projectId: string) => void
  setActiveSpace: (spaceId: string | null) => void
}

function adoptInitialUrlSelection(selection: InitialSelection) {
  const params = new URLSearchParams(window.location.search)
  const projectParam = params.get(PROJECT_PARAM)
  const spaceParam = params.get(SPACE_PARAM)
  const projectMatch = projectSelectionFromParam(projectParam, selection.projects)

  if (projectMatch && projectMatch.id !== selection.activeProjectId) {
    selection.switchProject(projectMatch.id)
    if (spaceParam) selection.setActiveSpace(spaceParam)
    return { projectSwitched: true, selectedSpaceId: selection.activeSpaceId }
  }

  const urlSpaceId = spaceSelectionFromParam(spaceParam, selection.spaces)
  if (urlSpaceId === undefined || (projectParam && !projectMatch)) {
    return { projectSwitched: false, selectedSpaceId: selection.activeSpaceId }
  }

  selection.setActiveSpace(urlSpaceId)
  return { projectSwitched: false, selectedSpaceId: urlSpaceId }
}

function setSelectionParam(url: URL, name: string, value: string | null) {
  if (value) url.searchParams.set(name, value)
  else url.searchParams.delete(name)
}

function replaceSelectionUrl(
  projects: ReadonlyArray<ProjectMeta>,
  activeProjectId: string | null,
  activeSpaceId: string | null,
) {
  const active = projects.find((project) => project.id === activeProjectId)
  const projectValue = active ? (active.cloudProjectId ?? active.id) : null
  const url = new URL(window.location.href)
  setSelectionParam(url, PROJECT_PARAM, projectValue)
  setSelectionParam(url, SPACE_PARAM, activeSpaceId)
  if (url.toString() !== window.location.href) {
    window.history.replaceState(window.history.state, "", url)
  }
}

// Mirrors the active project and space in query params on the main app page.
// The project param carries the cloud project id when the project is synced
// (the same id the public API and MCP use), falling back to the local project
// id for anonymous projects so tab restores and same-device links still
// resolve. Omitting the space param represents the all-spaces view.
export function useProjectUrlSync() {
  const hasHydrated = useTimerStore((s) => s.hasHydrated)
  const projects = useTimerStore((s) => s.projects)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const spaces = useTimerStore((s) => s.spaces)
  const activeSpaceId = useTimerStore((s) => s.activeSpaceId)
  const switchProject = useTimerStore((s) => s.switchProject)
  const setActiveSpace = useTimerStore((s) => s.setActiveSpace)
  const adoptedRef = useRef(false)

  useEffect(() => {
    if (!hasHydrated) return
    let selectedSpaceId = activeSpaceId

    if (!adoptedRef.current) {
      adoptedRef.current = true
      const initialSelection = adoptInitialUrlSelection({
        activeProjectId,
        activeSpaceId,
        projects,
        spaces,
        switchProject,
        setActiveSpace,
      })
      if (initialSelection.projectSwitched) {
        // Switching projects replaces the project-scoped spaces synchronously
        // and triggers another render. Sync the URL from that fresh selection.
        return
      }
      selectedSpaceId = initialSelection.selectedSpaceId
    }

    replaceSelectionUrl(projects, activeProjectId, selectedSpaceId)
  }, [hasHydrated, projects, activeProjectId, spaces, activeSpaceId, switchProject, setActiveSpace])
}

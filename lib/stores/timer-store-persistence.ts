import { writeRestoreKeyCookie } from "@/lib/cookies.client"
import type { LocalProjectPayload, ProjectMeta } from "@/lib/project-model"
import {
  readProjectPayload,
  writeActiveProjectId,
  writeProjectPayload,
  writeProjectRegistry,
} from "@/lib/project-storage.client"
import {
  activeProject,
  safeActiveSpaceId,
  safeSortMode,
  safeSpaces,
  safeTimerFilters,
  safeTimersForSpaces,
} from "@/lib/stores/timer-store-domain"
import type { TimerState } from "@/lib/stores/timer-store-types"

export { readActiveProjectId, readProjectRegistry, writeProjectPayload } from "@/lib/project-storage.client"

export function writeBrowserState(state: TimerState) {
  if (globalThis.window === undefined) return
  writeProjectRegistry(state.projects)
  writeActiveProjectId(state.activeProjectId)
  const project = activeProject(state)
  if (project) {
    writeProjectPayload(project.id, {
      timers: state.timers,
      spaces: state.spaces,
      activeSpaceId: state.activeSpaceId,
      sortMode: state.sortMode,
      timerFilters: state.timerFilters,
      updatedAt: project.updatedAt,
    })
  }
  writeRestoreKeyCookie(project?.restoreKey ?? null)
}

export function payloadForProject(project: ProjectMeta): LocalProjectPayload {
  const payload = readProjectPayload(project.id)
  if (!payload) {
    return {
      timers: [],
      spaces: [],
      activeSpaceId: null,
      sortMode: "manual",
      timerFilters: safeTimerFilters(undefined),
      updatedAt: project.updatedAt,
    }
  }

  const spaces = safeSpaces(payload.spaces)
  return {
    ...payload,
    timers: safeTimersForSpaces(payload.timers, spaces),
    spaces,
    activeSpaceId: safeActiveSpaceId(payload.activeSpaceId, spaces),
    sortMode: safeSortMode(payload.sortMode),
    timerFilters: safeTimerFilters(payload.timerFilters),
  }
}

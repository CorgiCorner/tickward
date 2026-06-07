import { nanoid } from "nanoid"

import { getEntitlements } from "@/lib/entitlements"
import {
  DEFAULT_PROJECT_NAME,
  type ProjectMeta,
  createProjectSnapshot,
  isValidRestoreKey,
  normalizeProjectName,
} from "@/lib/project-model"
import type { TimerState, TimerStore } from "@/lib/stores/timer-store-types"
import type { Space, Timer, TimerFilters, TimerSortMode } from "@/lib/types"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"

const TIMER_SORT_MODES = new Set<TimerSortMode>(["manual", "soonest", "latest", "name_asc", "recently_added"])

export const DEFAULT_TIMER_FILTERS: TimerFilters = {
  notifications: false,
  shared: false,
}

export function safeSortMode(mode: unknown): TimerSortMode {
  return typeof mode === "string" && TIMER_SORT_MODES.has(mode as TimerSortMode) ? (mode as TimerSortMode) : "manual"
}

export function safeTimerFilters(filters: unknown): TimerFilters {
  if (!filters || typeof filters !== "object") return { ...DEFAULT_TIMER_FILTERS }
  const candidate = filters as Partial<Record<keyof TimerFilters, unknown>>
  return {
    notifications: candidate.notifications === true,
    shared: candidate.shared === true,
  }
}

export function safeActiveSpaceId(activeSpaceId: string | null | undefined, spaces: Space[]) {
  if (activeSpaceId === UNASSIGNED_SPACE_ID) return activeSpaceId
  return activeSpaceId && spaces.some((space) => space.id === activeSpaceId) ? activeSpaceId : null
}

export function normalizePinnedTimers(timers: Timer[]) {
  let hasPinned = false
  for (const timer of timers) {
    if (!timer.pinned) continue
    if (timer.archivedAt || hasPinned) {
      timer.pinned = undefined
      continue
    }
    hasPinned = true
  }

  const pinnedIndex = timers.findIndex((timer) => timer.pinned && !timer.archivedAt)
  if (pinnedIndex <= 0) return
  const [pinned] = timers.splice(pinnedIndex, 1)
  if (pinned) timers.unshift(pinned)
}

export function safeTimers(timers: Timer[] | undefined) {
  const next = Array.isArray(timers) ? timers.slice(0, getEntitlements().maxTimers).map((timer) => ({ ...timer })) : []
  normalizePinnedTimers(next)
  return next
}

export function safeSpaces(spaces: Space[] | undefined) {
  return Array.isArray(spaces) ? spaces.slice(0, getEntitlements().maxSpaces) : []
}

export function safeTimersForSpaces(timers: Timer[] | undefined, spaces: Space[]) {
  const next = safeTimers(timers)
  for (const timer of next) {
    timer.spaceId = safeTimerSpaceId(spaces, timer.spaceId)
  }
  return next
}

export function activeProject(state: TimerState): ProjectMeta | null {
  return state.projects.find((p) => p.id === state.activeProjectId) ?? null
}

function hasSpaceId(spaces: Space[], spaceId: string) {
  for (const space of spaces) {
    if (space.id === spaceId) return true
  }
  return false
}

export function safeTimerSpaceId(spaces: Space[], spaceId?: string) {
  return spaceId && hasSpaceId(spaces, spaceId) ? spaceId : undefined
}

export function findTimerById(timers: Timer[], id: string) {
  for (const timer of timers) {
    if (timer.id === id) return timer
  }
  return undefined
}

export function findTimerIndexById(timers: Timer[], id: string, { activeOnly = false } = {}) {
  for (let index = 0; index < timers.length; index += 1) {
    const timer = timers[index]
    if (timer?.id === id && (!activeOnly || !timer.archivedAt)) return index
  }
  return -1
}

export function findSpaceById(spaces: Space[], id: string) {
  for (const space of spaces) {
    if (space.id === id) return space
  }
  return undefined
}

export function timersWithoutId(timers: Timer[], id: string) {
  const next: Timer[] = []
  for (const timer of timers) {
    if (timer.id !== id) next.push(timer)
  }
  return next
}

export function spacesWithoutId(spaces: Space[], id: string) {
  const next: Space[] = []
  for (const space of spaces) {
    if (space.id !== id) next.push(space)
  }
  return next
}

function visibleOrderedTimers(timers: Timer[], orderedIds: string[]) {
  const orderedTimers: Timer[] = []
  for (const id of orderedIds) {
    const timer = findTimerById(timers, id)
    if (!timer || timer.archivedAt || timer.pinned) return null
    orderedTimers.push(timer)
  }
  return orderedTimers
}

function uniqueOrderedIds(orderedIds: string[]) {
  const seen = new Set<string>()
  const uniqueIds: string[] = []
  for (const id of orderedIds) {
    if (seen.has(id)) return null
    seen.add(id)
    uniqueIds.push(id)
  }
  return uniqueIds.length > 0 ? uniqueIds : null
}

export function reorderVisibleTimerList(timers: Timer[], sortMode: TimerSortMode, orderedIds: string[]) {
  const uniqueIds = uniqueOrderedIds(orderedIds)
  if (!uniqueIds) return null

  const orderedTimers = visibleOrderedTimers(timers, uniqueIds)
  if (!orderedTimers) return null

  const idSet = new Set(uniqueIds)
  const next: Timer[] = []
  let orderedIndex = 0
  let changed = sortMode !== "manual"

  for (const timer of timers) {
    if (!idSet.has(timer.id)) {
      next.push(timer)
      continue
    }

    const replacement = orderedTimers[orderedIndex]
    orderedIndex += 1
    if (!replacement) return null
    if (replacement.id !== timer.id) changed = true
    next.push(replacement)
  }

  return changed ? next : null
}

export function upsertProject(projects: ProjectMeta[], existing: ProjectMeta | undefined, project: ProjectMeta) {
  if (!existing) return [project, ...projects]

  const next: ProjectMeta[] = []
  for (const current of projects) {
    next.push(current.id === existing.id ? project : current)
  }
  return next
}

export function defaultProjectMeta(args: {
  id?: string
  name?: string
  restoreKey?: string | null
  cloudProjectId?: string
  ownerId?: string
  claimedAt?: string
  now: string
  timers?: Timer[]
  spaces?: Space[]
  hasUnsyncedChanges?: boolean
}): ProjectMeta {
  return {
    id: args.id ?? nanoid(8),
    name: normalizeProjectName(args.name ?? DEFAULT_PROJECT_NAME),
    restoreKey: args.restoreKey && isValidRestoreKey(args.restoreKey) ? args.restoreKey : nanoid(12),
    cloudProjectId: args.cloudProjectId,
    ownerId: args.ownerId,
    claimedAt: args.claimedAt,
    createdAt: args.now,
    updatedAt: args.now,
    hasUnsyncedChanges: args.hasUnsyncedChanges,
    timerCount: args.timers?.length ?? 0,
    spaceCount: args.spaces?.length ?? 0,
  }
}

export function projectSnapshotFromState(state: TimerState, project: ProjectMeta) {
  return createProjectSnapshot({
    name: project.name,
    color: project.color,
    timers: state.timers,
    spaces: state.spaces,
    updatedAt: project.updatedAt,
  })
}

export function markActiveProjectChanged(state: TimerStore, now = new Date().toISOString()) {
  const project = activeProject(state)
  if (!project) return
  project.updatedAt = now
  project.hasUnsyncedChanges = true
  project.timerCount = state.timers.length
  project.spaceCount = state.spaces.length
}

export function syncActiveMetaCounts(state: TimerStore) {
  const project = activeProject(state)
  if (!project) return
  project.timerCount = state.timers.length
  project.spaceCount = state.spaces.length
}

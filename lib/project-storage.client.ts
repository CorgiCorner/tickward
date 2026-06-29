"use client"

import {
  type LocalProjectPayload,
  MAX_PROJECTS,
  type ProjectMeta,
  isValidRestoreKey,
  normalizeProjectName,
} from "@/lib/project-model"
import { getEntitlements } from "@/lib/entitlements"
import { safeTimerFilters } from "@/lib/stores/timer-store-domain"
import type { Space, Timer, TimerSortMode } from "@/lib/types"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"

export const TD_PROJECTS_STORAGE_KEY = "td_projects_v1"
export const TD_ACTIVE_PROJECT_STORAGE_KEY = "td_active_project_v1"
export const TD_PROJECT_PAYLOAD_PREFIX = "td_project_payload:"

const TIMER_SORT_MODES = new Set<TimerSortMode>(["manual", "soonest", "latest", "name_asc", "recently_added"])

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function normalizeSortMode(value: unknown): TimerSortMode {
  return typeof value === "string" && TIMER_SORT_MODES.has(value as TimerSortMode) ? (value as TimerSortMode) : "manual"
}

function normalizeTimerSpaceIds(timers: Timer[], spaces: Space[]) {
  const spaceIds = new Set(spaces.map((space) => space.id))
  return timers.map((timer) => {
    if (!timer.spaceId || spaceIds.has(timer.spaceId)) return timer
    return { ...timer, spaceId: undefined }
  })
}

function normalizeProjectMeta(value: unknown): ProjectMeta | null {
  if (!value || typeof value !== "object") return null
  const any = value as Record<string, unknown>
  if (
    typeof any.id !== "string" ||
    typeof any.name !== "string" ||
    typeof any.restoreKey !== "string" ||
    typeof any.createdAt !== "string" ||
    typeof any.updatedAt !== "string" ||
    !isValidRestoreKey(any.restoreKey)
  ) {
    return null
  }

  return {
    id: any.id,
    name: normalizeProjectName(any.name),
    restoreKey: any.restoreKey,
    cloudProjectId: typeof any.cloudProjectId === "string" ? any.cloudProjectId : undefined,
    ownerId: typeof any.ownerId === "string" ? any.ownerId : undefined,
    claimedAt: typeof any.claimedAt === "string" ? any.claimedAt : undefined,
    color: typeof any.color === "string" ? any.color : undefined,
    createdAt: any.createdAt,
    updatedAt: any.updatedAt,
    lastSyncedAt: typeof any.lastSyncedAt === "string" ? any.lastSyncedAt : undefined,
    lastRemoteUpdatedAt: typeof any.lastRemoteUpdatedAt === "string" ? any.lastRemoteUpdatedAt : undefined,
    hasUnsyncedChanges: Boolean(any.hasUnsyncedChanges),
    timerCount: typeof any.timerCount === "number" ? any.timerCount : undefined,
    spaceCount: typeof any.spaceCount === "number" ? any.spaceCount : undefined,
  }
}

export function readProjectRegistry(): ProjectMeta[] {
  if (globalThis.window === undefined) return []
  const raw = safeParse<unknown[]>(globalThis.localStorage.getItem(TD_PROJECTS_STORAGE_KEY))
  if (!Array.isArray(raw)) return []

  const seenKeys = new Set<string>()
  const projects: ProjectMeta[] = []
  for (const item of raw) {
    const project = normalizeProjectMeta(item)
    if (!project || seenKeys.has(project.restoreKey)) continue
    seenKeys.add(project.restoreKey)
    projects.push(project)
  }
  return projects.slice(0, MAX_PROJECTS)
}

export function writeProjectRegistry(projects: ProjectMeta[]) {
  if (globalThis.window === undefined) return
  globalThis.localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify(projects))
}

export function readActiveProjectId() {
  if (globalThis.window === undefined) return null
  return globalThis.localStorage.getItem(TD_ACTIVE_PROJECT_STORAGE_KEY)
}

export function writeActiveProjectId(projectId: string | null) {
  if (globalThis.window === undefined) return
  if (!projectId) {
    globalThis.localStorage.removeItem(TD_ACTIVE_PROJECT_STORAGE_KEY)
    return
  }
  globalThis.localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, projectId)
}

export function projectPayloadStorageKey(projectId: string) {
  return `${TD_PROJECT_PAYLOAD_PREFIX}${projectId}`
}

export function readProjectPayload(projectId: string): LocalProjectPayload | null {
  if (globalThis.window === undefined) return null
  const raw = safeParse<Record<string, unknown>>(globalThis.localStorage.getItem(projectPayloadStorageKey(projectId)))
  if (!raw) return null

  const spaces: Space[] = isSpaceArray(raw.spaces) ? raw.spaces.slice(0, getEntitlements().maxSpaces) : []
  const timers: Timer[] = normalizeTimerSpaceIds(isTimerArray(raw.timers) ? raw.timers.slice(0, 50) : [], spaces)
  const activeSpaceId = typeof raw.activeSpaceId === "string" ? raw.activeSpaceId : null
  const sortMode = normalizeSortMode(raw.sortMode)
  const timerFilters = safeTimerFilters(raw.timerFilters)
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString()
  const safeActiveSpaceId =
    activeSpaceId === UNASSIGNED_SPACE_ID || (activeSpaceId && spaces.some((s) => s.id === activeSpaceId))
      ? activeSpaceId
      : null

  return {
    timers,
    spaces,
    activeSpaceId: safeActiveSpaceId,
    sortMode,
    timerFilters,
    updatedAt,
  }
}

export function writeProjectPayload(projectId: string, payload: LocalProjectPayload) {
  if (globalThis.window === undefined) return
  globalThis.localStorage.setItem(projectPayloadStorageKey(projectId), JSON.stringify(payload))
}

export function removeProjectPayload(projectId: string) {
  if (globalThis.window === undefined) return
  globalThis.localStorage.removeItem(projectPayloadStorageKey(projectId))
}

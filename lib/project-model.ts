import { getEntitlements } from "@/lib/entitlements"
import { formatMessage } from "@/lib/i18n/messages"
import { LIMITS } from "@/lib/limits"
import { PUBLIC_ERROR_CODES, createPublicError, type PublicError } from "@/lib/public-errors"
import type { Space, Timer, TimerFilters, TimerSortMode } from "@/lib/types"
import { isSpaceArray, isTimerArray, validateSpacesPayload, validateTimersPayload } from "@/lib/validate"

export const PROJECT_SNAPSHOT_VERSION = 2
// Kept as a named export for back-compat; entitlements define current limits.
export const MAX_PROJECTS = LIMITS.projects
export const DEFAULT_PROJECT_NAME = formatMessage("project.defaultTimersName")

export type ProjectMeta = {
  id: string
  name: string
  restoreKey: string
  cloudProjectId?: string
  ownerId?: string
  claimedAt?: string
  color?: string
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
  lastRemoteUpdatedAt?: string
  hasUnsyncedChanges?: boolean
  timerCount?: number
  spaceCount?: number
  /** ISO timestamp set by the GC sweep when the project first became read-only over-limit. */
  overLimitSince?: string
  /**
   * ISO timestamp indicating when the project will be purged.
   * Present only when overLimitSince is set and retention is configured server-side.
   */
  overLimitPurgeAt?: string
}

export type ProjectSnapshotV2 = {
  version: typeof PROJECT_SNAPSHOT_VERSION
  name: string
  color?: string
  timers: Timer[]
  spaces: Space[]
  updatedAt: string
}

export type LocalProjectPayload = {
  timers: Timer[]
  spaces: Space[]
  activeSpaceId: string | null
  sortMode?: TimerSortMode
  timerFilters?: TimerFilters
  updatedAt: string
}

export type ProjectRestoreResponse = {
  project: ProjectSnapshotV2
  source: "project" | "legacy"
  projectId?: string
  ownerId?: string | null
}

export type UserProjectSummary = {
  projectId: string
  name: string
  color?: string
  ownerId: string | null
  claimedAt?: string
  createdAt: string
  updatedAt: string
  timerCount: number
  spaceCount: number
  /** ISO timestamp set by the GC sweep when the project first became read-only over-limit. */
  overLimitSince?: string
  /**
   * ISO timestamp indicating when the project will be purged.
   * Present only when overLimitSince is set and retention is configured server-side.
   */
  overLimitPurgeAt?: string
}

export { isValidRestoreKey } from "@/lib/identifiers"

export function isValidProjectId(value: string) {
  return /^[A-Za-z0-9_-]{6,128}$/.test(value)
}

export function normalizeProjectName(name: string) {
  const trimmed = name.trim()
  return (trimmed || DEFAULT_PROJECT_NAME).slice(0, 40)
}

export function isProjectSnapshot(value: unknown): value is ProjectSnapshotV2 {
  if (!value || typeof value !== "object") return false
  const any = value as Record<string, unknown>
  return (
    any.version === PROJECT_SNAPSHOT_VERSION &&
    typeof any.name === "string" &&
    any.name.length > 0 &&
    any.name.length <= 40 &&
    typeof any.updatedAt === "string" &&
    isTimerArray(any.timers) &&
    isSpaceArray(any.spaces)
  )
}

export function validateProjectSnapshot(project: ProjectSnapshotV2): PublicError | null {
  if (!isProjectSnapshot(project)) {
    return createPublicError(PUBLIC_ERROR_CODES.invalidProjectPayload, "errors.invalidProjectPayload")
  }

  const entitlements = getEntitlements()
  if (project.timers.length > entitlements.maxSnapshotTimers) {
    return createPublicError(PUBLIC_ERROR_CODES.tooManyTimers, "errors.tooManyTimers", {
      max: entitlements.maxSnapshotTimers,
    })
  }

  const timersError = validateTimersPayload(project.timers)
  if (timersError) {
    return createPublicError(PUBLIC_ERROR_CODES.invalidTimerFields, "errors.invalidTimerFields")
  }

  if (project.spaces.length > entitlements.maxSpaces) {
    return createPublicError(PUBLIC_ERROR_CODES.tooManySpaces, "errors.tooManySpaces", { max: entitlements.maxSpaces })
  }

  if (validateSpacesPayload(project.spaces)) {
    return createPublicError(PUBLIC_ERROR_CODES.invalidSpace, "errors.invalidSpace")
  }

  return null
}

export function createProjectSnapshot(args: {
  name: string
  color?: string
  timers: Timer[]
  spaces: Space[]
  updatedAt: string
}): ProjectSnapshotV2 {
  return {
    version: PROJECT_SNAPSHOT_VERSION,
    name: normalizeProjectName(args.name),
    color: args.color,
    timers: args.timers,
    spaces: args.spaces,
    updatedAt: args.updatedAt,
  }
}

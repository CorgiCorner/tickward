import type { ProjectMeta, ProjectSnapshotV2 } from "@/lib/project-model"
import type { TimerState } from "@/lib/stores/timer-store-types"

export async function safeText(res: Response) {
  try {
    return await res.text()
  } catch {
    return ""
  }
}

export const SYNC_DEBOUNCE_MS = 1200

/**
 * Decide whether a refresh from cloud should surface a conflict before adopting
 * the remote snapshot. Mirrors the two store guards exactly:
 * - local has unsynced changes AND we previously saw a remote version that no
 *   longer matches the incoming one, or
 * - local has unsynced changes, never saw a remote version, and the incoming
 *   remote differs from our own updatedAt.
 */
export function isRefreshConflict(project: ProjectMeta, remote: ProjectSnapshotV2) {
  if (!project.hasUnsyncedChanges) return false
  if (project.lastRemoteUpdatedAt) return remote.updatedAt !== project.lastRemoteUpdatedAt
  return remote.updatedAt !== project.updatedAt
}

/**
 * The baseUpdatedAt sent on a regular save is the last remote version we are
 * aware of. Forced saves omit it.
 */
export function baseUpdatedAtForRegularSave(project: ProjectMeta) {
  return project.lastRemoteUpdatedAt
}

export function baseUpdatedAtForForcedSave() {
  return undefined
}

/**
 * Whether the debounced sync scheduler is allowed to run for the current state.
 * Mirrors the store guard: requires hydration, cloud access, and no pending
 * conflict.
 */
export function canScheduleSync(state: TimerState) {
  const activeProject = state.projects.find((project) => project.id === state.activeProjectId)
  const hasRestoreKey = typeof state.restoreKey === "string" && state.restoreKey.length > 0
  const hasCloudProject = Boolean(activeProject?.cloudProjectId)
  return state.hasHydrated && (hasRestoreKey || hasCloudProject) && !state.projectConflict
}

/**
 * Tiny debounce/scheduling primitive for cloud sync. Keeps the single in-flight
 * timeout handle and exposes schedule/cancel. Immediate scheduling cancels any
 * pending timeout and runs the callback synchronously.
 */
export function createSyncScheduler(run: () => void, delayMs = SYNC_DEBOUNCE_MS) {
  let timeout: ReturnType<typeof globalThis.setTimeout> | null = null

  function cancel() {
    if (timeout !== null) {
      globalThis.clearTimeout(timeout)
      timeout = null
    }
  }

  function schedule(immediate = false) {
    cancel()
    if (immediate) {
      run()
      return
    }
    timeout = globalThis.setTimeout(run, delayMs)
  }

  return { schedule, cancel }
}

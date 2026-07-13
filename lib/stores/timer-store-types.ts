import type { EntitlementsTable, PlanId } from "@/lib/entitlements"
import type { ProjectMeta, ProjectRestoreResponse, ProjectSnapshotV2 } from "@/lib/project-model"
import type { Space, Timer, TimerFilterKey, TimerFilterType, TimerFilters, TimerSortMode } from "@/lib/types"

export type ProjectConflict = {
  projectId: string
  remote: ProjectSnapshotV2
  source: ProjectRestoreResponse["source"]
}

export type TimerState = {
  timers: Timer[]
  spaces: Space[]
  activeSpaceId: string | null
  sortMode: TimerSortMode
  timerFilters: TimerFilters
  restoreKey: string | null

  projects: ProjectMeta[]
  activeProjectId: string | null
  hasHydrated: boolean
  isCheckingCloud: boolean
  projectConflict: ProjectConflict | null
  /** True when the active project is over the account project limit and therefore read-only. */
  isActiveProjectReadOnly: boolean
}

export type TimerActions = {
  hydrateProjectsFromBrowser: () => void

  addTimer: (timer: Omit<Timer, "id" | "createdAt"> & { id?: string }) => boolean
  removeTimer: (id: string) => void
  updateTimer: (id: string, updates: Partial<Timer>) => void
  archiveTimer: (id: string) => void
  unarchiveTimer: (id: string) => void
  duplicateTimer: (id: string) => void
  setPinnedTimer: (id: string | null) => void
  reorderTimers: (fromIndex: number, toIndex: number) => void
  reorderVisibleTimers: (orderedIds: string[]) => void
  clearAllTimers: () => void

  followTimer: (args: { shareId: string; timer: Omit<Timer, "id" | "createdAt"> }) => boolean
  unfollowTimer: (id: string) => void
  refreshFollowedTimers: () => Promise<void>

  createSpace: (name: string, color?: string) => void
  updateSpace: (id: string, updates: Partial<Space>) => void
  deleteSpace: (id: string) => void
  reorderSpaces: (fromIndex: number, toIndex: number) => void
  moveTimerToSpace: (timerId: string, spaceId: string | null) => void
  moveTimerToProject: (timerId: string, targetProjectId: string) => boolean
  setActiveSpace: (spaceId: string | null) => void
  setTimerSortMode: (mode: TimerSortMode) => void
  setTimerFilterType: (type: TimerFilterType) => void
  setTimerFilter: (filter: TimerFilterKey, enabled: boolean) => void
  clearTimerFilters: () => void

  createProject: (name?: string) => void
  switchProject: (projectId: string) => void
  renameActiveProject: (name: string) => void
  removeActiveProjectFromDevice: () => void
  removeAccountProjectsFromDevice: () => void
  refreshAccountProjectsFromCloud: () => Promise<void>
  restoreProjectFromCloud: (key: string) => Promise<void>
  refreshActiveProjectFromCloud: () => Promise<void>
  useCloudProjectVersion: () => void
  overwriteCloudProjectVersion: () => Promise<void>
  deleteActiveProjectFromCloud: () => Promise<void>
  claimActiveProject: () => Promise<
    "claimed" | "claimed_read_only" | "cancelled" | "not_found" | "sync_failed" | "unauthenticated" | "unsupported"
  >
  maybeAutoClaimActiveProject: () => Promise<
    | "claimed"
    | "claimed_read_only"
    | "skipped"
    | "cancelled"
    | "not_found"
    | "sync_failed"
    | "unauthenticated"
    | "unsupported"
  >

  setRestoreKey: (key: string | null) => void
  regenerateRestoreKey: () => void

  syncToCloud: (opts?: { force?: boolean }) => Promise<boolean>
  restoreFromCloud: (key: string) => Promise<void>
  clearFromCloud: () => Promise<void>
}

export type TimerStore = TimerState &
  TimerActions & {
    lastSyncError: string | null
    lastSyncAt: string | null
    isSyncing: boolean
  }

export type TimerStoreInit = Partial<
  Pick<TimerState, "timers" | "spaces" | "activeSpaceId" | "sortMode" | "timerFilters" | "restoreKey">
> & {
  activePlan?: PlanId
  entitlementsTable?: EntitlementsTable
}

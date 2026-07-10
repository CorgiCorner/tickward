"use client"

import { type PropsWithChildren, createContext, useContext, useEffect, useState } from "react"
import { useStore } from "zustand"
import { immer } from "zustand/middleware/immer"
import { type StoreApi, createStore } from "zustand/vanilla"

import { canCreateTimerInSpace, getEntitlements } from "./entitlements"
import { accountProjectMemberships, isProjectReadOnly } from "./project-lock"
import { logClientError, safeClientErrorMessage } from "./client-errors"
import { formatMessage } from "./i18n/messages"
import { isProjectClaimDismissed } from "./project-claim-dismissal.client"
import { projectCloudClient, type RestoreProjectResult } from "./project-client"
import {
  MAX_PROJECTS,
  type ProjectMeta,
  type UserProjectSummary,
  isValidRestoreKey,
  normalizeProjectName,
} from "./project-model"
import { readProjectPayload, removeProjectPayload } from "./project-storage.client"
import { newPublicId } from "./public-ids"
import { activeTimerCountForTargetSpace } from "./timer-space-limits"
import {
  DEFAULT_TIMER_SORT_MODE,
  activeProject,
  DEFAULT_TIMER_FILTERS,
  defaultProjectMeta,
  findSpaceById,
  findTimerById,
  findTimerIndexById,
  markActiveProjectChanged,
  normalizePinnedTimers,
  projectSnapshotFromState,
  reorderVisibleTimerList,
  safeActiveSpaceId,
  safeSortMode,
  safeSpaces,
  safeTimerFilterType,
  safeTimerFilters,
  safeTimerSpaceId,
  safeTimersForSpaces,
  spacesWithoutId,
  syncActiveMetaCounts,
  syncReadOnlyState,
  timersWithoutId,
  upsertProject,
} from "./stores/timer-store-domain"
import { applyFollowedTimerResults, fetchFollowedTimerResults, followedShareIds } from "./stores/timer-store-followed"
import {
  payloadForProject,
  readActiveProjectId,
  readProjectRegistry,
  writeBrowserState,
  writeProjectPayload,
} from "./stores/timer-store-persistence"
import {
  baseUpdatedAtForForcedSave,
  baseUpdatedAtForRegularSave,
  canScheduleSync,
  createSyncScheduler,
  isRefreshConflict,
} from "./stores/timer-store-sync"
import type { TimerStore, TimerStoreInit } from "./stores/timer-store-types"
import type { Timer } from "./types"

export type {
  ProjectConflict,
  TimerActions,
  TimerState,
  TimerStore,
  TimerStoreInit,
} from "./stores/timer-store-types"

function canAddTimerToSpace(timers: Timer[], spaceId: string | null | undefined, { archived = false } = {}) {
  const entitlements = getEntitlements()
  if (archived) return timers.length < entitlements.maxTimers
  return canCreateTimerInSpace(timers.length, activeTimerCountForTargetSpace(timers, spaceId), entitlements)
}

type ProjectCloudAccess = { kind: "restore-key"; restoreKey: string } | { kind: "user-project"; projectId: string }

function projectCloudAccess(project: ProjectMeta | null, restoreKey: string | null): ProjectCloudAccess | null {
  if (project?.cloudProjectId) return { kind: "user-project", projectId: project.cloudProjectId }
  if (restoreKey && isValidRestoreKey(restoreKey)) return { kind: "restore-key", restoreKey }
  return null
}

async function restoreProjectByAccess(access: ProjectCloudAccess) {
  return access.kind === "user-project"
    ? projectCloudClient.restoreUserProject(access.projectId)
    : projectCloudClient.restoreProject(access.restoreKey)
}

async function clearProjectByAccess(access: ProjectCloudAccess) {
  if (access.kind === "user-project") {
    await projectCloudClient.clearUserProject(access.projectId)
    return
  }
  await projectCloudClient.clearProject(access.restoreKey)
}

function restoreStatusErrorMessage(status: Exclude<RestoreProjectResult["status"], "ok">) {
  if (status === "unsupported") return formatMessage("errors.claimUnsupported")
  if (status === "unauthenticated") return formatMessage("errors.signInRequired")
  return null
}

function shouldRecoverMissingProject(result: RestoreProjectResult, state: TimerStore, access: ProjectCloudAccess) {
  // Only anonymous (restore-key) projects re-upload to recover a server-side
  // loss. An account project that 404s must never be re-uploaded: doing so
  // creates a brand-new server project (a duplicate/mint) instead of recovering
  // the original. Its account identity is kept and a transient 404 self-heals.
  const project = activeProject(state)
  return (
    access.kind === "restore-key" &&
    result.status === "not_found" &&
    Boolean(project?.hasUnsyncedChanges) &&
    (state.timers.length > 0 || state.spaces.length > 0)
  )
}

function projectMetaFromAccountSummary(summary: UserProjectSummary, existing: ProjectMeta | undefined): ProjectMeta {
  const hasLocalChanges = existing?.hasUnsyncedChanges === true

  return {
    id: existing?.id ?? newPublicId("project"),
    name: hasLocalChanges ? existing.name : normalizeProjectName(summary.name),
    restoreKey: existing?.restoreKey ?? newPublicId("restoreKey"),
    cloudProjectId: summary.projectId,
    ownerId: summary.ownerId ?? undefined,
    claimedAt: summary.claimedAt,
    color: hasLocalChanges ? existing.color : summary.color,
    createdAt: existing?.createdAt ?? summary.createdAt,
    updatedAt: hasLocalChanges ? existing.updatedAt : summary.updatedAt,
    lastSyncedAt: existing?.lastSyncedAt,
    lastRemoteUpdatedAt: summary.updatedAt,
    hasUnsyncedChanges: existing?.hasUnsyncedChanges,
    timerCount: hasLocalChanges ? existing.timerCount : summary.timerCount,
    spaceCount: hasLocalChanges ? existing.spaceCount : summary.spaceCount,
    overLimitSince: summary.overLimitSince,
    overLimitPurgeAt: summary.overLimitPurgeAt,
  }
}

function projectsByCloudId(projects: ProjectMeta[]) {
  const pairs = projects.flatMap((project) =>
    project.cloudProjectId ? [[project.cloudProjectId, project] as const] : [],
  )
  return new Map(pairs)
}

function syncedAccountProjectMetas(summaries: UserProjectSummary[], projects: ProjectMeta[]) {
  const existingByCloudId = projectsByCloudId(projects)
  const accountProjects = summaries.map((project) =>
    projectMetaFromAccountSummary(project, existingByCloudId.get(project.projectId)),
  )
  const localProjects = projects.filter((project) => !project.cloudProjectId)
  return [...accountProjects, ...localProjects]
}

function applyProjectPayloadToState(state: TimerStore, project: ProjectMeta | null) {
  if (!project) {
    state.timers = []
    state.spaces = []
    state.activeSpaceId = null
    state.sortMode = DEFAULT_TIMER_SORT_MODE
    state.timerFilters = { ...DEFAULT_TIMER_FILTERS }
    return
  }

  const payload = payloadForProject(project)
  state.timers = payload.timers
  state.spaces = payload.spaces
  state.activeSpaceId = payload.activeSpaceId
  state.sortMode = safeSortMode(payload.sortMode)
  state.timerFilters = safeTimerFilters(payload.timerFilters)
}

export function createTimerStore(init?: TimerStoreInit) {
  const syncScheduler = createSyncScheduler(() => {
    void store.getState().syncToCloud()
  })
  let refreshFollowedInFlight: Promise<void> | null = null
  let cloudCheckInFlight: Promise<void> | null = null
  let cloudCheckProjectId: string | null = null
  let accountProjectsInFlight: Promise<void> | null = null
  // Generation counter for account-scoped requests. Sign-out bumps it so any
  // response started under the previous session is discarded before it can
  // write account data back into the store or browser storage. Restore-key and
  // followed-timer paths stay unguarded on purpose: anonymous mounts also call
  // removeAccountProjectsFromDevice and must keep applying their refreshes.
  let accountEpoch = 0
  let autoClaimInFlight: ReturnType<TimerStore["maybeAutoClaimActiveProject"]> | null = null
  // Restore keys the server answered not_found for in this page session.
  // Focus- and interval-driven refreshes skip them until a successful save
  // revives the key: re-checking a dead key cannot succeed and spams the API.
  const deadRestoreKeys = new Set<string>()
  // Id of the project hydration resurrected purely from the restore-key
  // cookie (empty registry, no legacy payload). If its first cloud check
  // returns not_found the key is dead and the empty ghost is removed.
  let cookieGhostProjectId: string | null = null
  // One auto-claim attempt per project per page session; on failure the manual
  // claim toast remains as the fallback.
  const autoClaimAttemptedProjectIds = new Set<string>()

  const initialSpaces = safeSpaces(init?.spaces)
  const initialTimers = safeTimersForSpaces(init?.timers, initialSpaces)
  const initialActiveSpaceId = safeActiveSpaceId(init?.activeSpaceId, initialSpaces)
  const initialSortMode = safeSortMode(init?.sortMode)
  const initialTimerFilters = safeTimerFilters(init?.timerFilters)
  const initialRestoreKey = init?.restoreKey && isValidRestoreKey(init.restoreKey) ? init.restoreKey : null

  const store = createStore<TimerStore>()(
    immer((set, get) => {
      function canEditActiveProject(): boolean {
        const state = get()
        const activeId = state.activeProjectId
        if (!activeId) return true
        const active = state.projects.find((p) => p.id === activeId)
        if (!active?.cloudProjectId) return true
        const memberships = accountProjectMemberships(state.projects)
        const max = getEntitlements().maxProjects
        return !isProjectReadOnly(memberships, active.cloudProjectId, max)
      }

      async function refreshFollowedTimersOnce() {
        const shareIds = followedShareIds(get().timers)
        if (shareIds.length === 0) return

        const results = await fetchFollowedTimerResults(shareIds)
        const nowIso = new Date().toISOString()
        let changed = false

        set((s) => {
          changed = applyFollowedTimerResults(s, results, nowIso)
        })

        if (changed) persistAndSchedule()
      }

      async function refreshActiveProjectFromCloudOnce(startedProjectId: string, access: ProjectCloudAccess) {
        const startedEpoch = accountEpoch
        cloudCheckProjectId = startedProjectId

        set((s) => {
          s.isCheckingCloud = true
        })

        // A stale response can resolve while a newer check for another project
        // is already in flight; only the request still owning the cloud-check
        // slot may clear the shared loading flag.
        const clearCheckingIfCurrent = () => {
          if (cloudCheckProjectId !== startedProjectId) return
          set((s) => {
            s.isCheckingCloud = false
          })
        }

        try {
          const result = await restoreProjectByAccess(access)

          if (access.kind === "user-project" && startedEpoch !== accountEpoch) {
            clearCheckingIfCurrent()
            return
          }

          if (get().activeProjectId !== startedProjectId) {
            clearCheckingIfCurrent()
            return
          }

          const wasCookieGhost = cookieGhostProjectId === startedProjectId
          if (wasCookieGhost) cookieGhostProjectId = null

          if (result.status === "not_found" || result.status === "unauthenticated" || result.status === "unsupported") {
            const syncError = restoreStatusErrorMessage(result.status)
            if (access.kind === "restore-key" && result.status === "not_found") {
              deadRestoreKeys.add(access.restoreKey)
              if (wasCookieGhost && get().timers.length === 0 && get().spaces.length === 0) {
                // The cookie pointed at a consumed key and the resurrected
                // project never had content: drop the empty ghost instead of
                // keeping a local project that can only ever 404.
                set((s) => {
                  s.isCheckingCloud = false
                })
                get().removeActiveProjectFromDevice()
                return
              }
            }
            set((s) => {
              s.isCheckingCloud = false
              s.lastSyncError = syncError
            })
            writeBrowserState(get())
            if (shouldRecoverMissingProject(result, get(), access)) {
              void get().syncToCloud({ force: true })
            }
            return
          }

          const data = result.data
          const remote = data.project
          const remoteSpaces = safeSpaces(remote.spaces)
          const remoteTimers = safeTimersForSpaces(remote.timers, remoteSpaces)
          const now = new Date().toISOString()
          const currentProject = activeProject(get())
          if (!currentProject) return

          if (isRefreshConflict(currentProject, remote)) {
            set((s) => {
              s.projectConflict = { projectId: startedProjectId, remote, source: data.source }
              s.isCheckingCloud = false
            })
            writeBrowserState(get())
            return
          }

          set((s) => {
            const project = activeProject(s)
            if (!project) return
            project.name = remote.name
            project.color = remote.color
            if (access.kind === "user-project") {
              project.cloudProjectId = data.projectId ?? project.cloudProjectId
              project.ownerId = data.ownerId ?? project.ownerId
            }
            project.updatedAt = remote.updatedAt
            project.lastRemoteUpdatedAt = remote.updatedAt
            project.lastSyncedAt = now
            project.hasUnsyncedChanges = false
            project.timerCount = remote.timers.length
            project.spaceCount = remote.spaces.length
            s.timers = remoteTimers
            s.spaces = remoteSpaces
            s.activeSpaceId = safeActiveSpaceId(s.activeSpaceId, s.spaces)
            s.lastSyncAt = now
            s.lastSyncError = null
            s.isCheckingCloud = false
            s.projectConflict = null
          })
          writeBrowserState(get())
        } catch (err) {
          if (access.kind === "user-project" && startedEpoch !== accountEpoch) {
            clearCheckingIfCurrent()
            return
          }
          // A stale refresh must stay silent: if the active project changed
          // while the request was in flight, the error belongs to the old one.
          if (get().activeProjectId !== startedProjectId) {
            clearCheckingIfCurrent()
            return
          }
          logClientError("store.refreshActiveProjectFromCloud", err)
          set((s) => {
            s.lastSyncError = safeClientErrorMessage(err, "errors.restoreFailed")
            s.isCheckingCloud = false
          })
        }
      }

      async function refreshAccountProjectsFromCloudOnce() {
        const startedEpoch = accountEpoch
        const result = await projectCloudClient.listUserProjects()
        // A sign-out while the list was in flight already wiped account data
        // from the device; applying the response would bring it back.
        if (startedEpoch !== accountEpoch) return
        if (result.status !== "ok") return

        const summaryIds = new Set(result.projects.map((project) => project.projectId))
        for (const project of get().projects) {
          if (project.cloudProjectId && !summaryIds.has(project.cloudProjectId)) {
            removeProjectPayload(project.id)
          }
        }

        const currentProjects = get().projects
        const nextProjects = syncedAccountProjectMetas(result.projects, currentProjects)
        const currentActiveProjectId = get().activeProjectId
        const nextActiveProject =
          nextProjects.find((project) => project.id === currentActiveProjectId) ?? nextProjects[0] ?? null
        const activeChanged = nextActiveProject?.id !== currentActiveProjectId
        const shouldRefreshActiveProject = activeChanged && Boolean(nextActiveProject?.cloudProjectId)

        set((s) => {
          s.projects = nextProjects
          s.activeProjectId = nextActiveProject?.id ?? null
          s.restoreKey = nextActiveProject?.restoreKey ?? null
          if (activeChanged) {
            applyProjectPayloadToState(s, nextActiveProject)
            s.lastSyncAt = nextActiveProject?.lastSyncedAt ?? null
            s.lastSyncError = null
            s.projectConflict = null
          }
          syncReadOnlyState(s)
        })
        writeBrowserState(get())
        if (shouldRefreshActiveProject) await get().refreshActiveProjectFromCloud()
      }

      return {
        timers: initialTimers,
        spaces: initialSpaces,
        activeSpaceId: initialActiveSpaceId,
        sortMode: initialSortMode,
        timerFilters: initialTimerFilters,
        restoreKey: initialRestoreKey,

        projects: [],
        activeProjectId: null,
        hasHydrated: false,
        isCheckingCloud: false,
        projectConflict: null,
        isActiveProjectReadOnly: false,

        lastSyncError: null,
        lastSyncAt: null,
        isSyncing: false,

        hydrateProjectsFromBrowser: () => {
          if (get().hasHydrated || globalThis.window === undefined) return

          const now = new Date().toISOString()
          const legacyHasPayload = initialTimers.length > 0 || initialSpaces.length > 0
          let projects = readProjectRegistry()
          let activeProjectId = readActiveProjectId()

          if (projects.length === 0 && (legacyHasPayload || initialRestoreKey)) {
            const project = defaultProjectMeta({
              now,
              restoreKey: initialRestoreKey,
              timers: initialTimers,
              spaces: initialSpaces,
              hasUnsyncedChanges: legacyHasPayload,
            })
            projects = [project]
            activeProjectId = project.id
            if (!legacyHasPayload) cookieGhostProjectId = project.id
            writeProjectPayload(project.id, {
              timers: initialTimers,
              spaces: initialSpaces,
              activeSpaceId: initialActiveSpaceId,
              sortMode: initialSortMode,
              timerFilters: initialTimerFilters,
              updatedAt: project.updatedAt,
            })
          } else if (
            initialRestoreKey &&
            legacyHasPayload &&
            !projects.some((project) => project.restoreKey === initialRestoreKey) &&
            projects.length < MAX_PROJECTS
          ) {
            const project = defaultProjectMeta({
              now,
              name: formatMessage("project.restoredName"),
              restoreKey: initialRestoreKey,
              timers: initialTimers,
              spaces: initialSpaces,
              hasUnsyncedChanges: true,
            })
            projects = [project, ...projects]
            activeProjectId = project.id
            writeProjectPayload(project.id, {
              timers: initialTimers,
              spaces: initialSpaces,
              activeSpaceId: initialActiveSpaceId,
              sortMode: initialSortMode,
              timerFilters: initialTimerFilters,
              updatedAt: project.updatedAt,
            })
          }

          const selectedProject =
            projects.find((project) => project.id === activeProjectId) ??
            projects.find((project) => project.restoreKey === initialRestoreKey) ??
            projects[0]

          const selectedPayload = selectedProject ? payloadForProject(selectedProject) : null

          set((state) => {
            state.projects = projects
            state.activeProjectId = selectedProject?.id ?? null
            state.timers = selectedPayload?.timers ?? []
            state.spaces = selectedPayload?.spaces ?? []
            state.activeSpaceId = selectedPayload?.activeSpaceId ?? null
            state.sortMode = safeSortMode(selectedPayload?.sortMode)
            state.timerFilters = safeTimerFilters(selectedPayload?.timerFilters)
            state.restoreKey = selectedProject?.restoreKey ?? null
            state.hasHydrated = true
            state.lastSyncAt = selectedProject?.lastSyncedAt ?? null
            state.lastSyncError = null
            syncActiveMetaCounts(state)
            syncReadOnlyState(state)
          })

          writeBrowserState(get())
          void get().refreshActiveProjectFromCloud()
        },

        addTimer: (timer) => {
          if (!activeProject(get())) {
            const now = new Date().toISOString()
            const project = defaultProjectMeta({
              now,
              hasUnsyncedChanges: true,
            })
            set((s) => {
              if (activeProject(s)) return
              s.projects = [project]
              s.activeProjectId = project.id
              s.timers = []
              s.spaces = []
              s.activeSpaceId = null
              s.sortMode = DEFAULT_TIMER_SORT_MODE
              s.timerFilters = { ...DEFAULT_TIMER_FILTERS }
              s.restoreKey = project.restoreKey
              s.lastSyncAt = null
              s.lastSyncError = null
              s.projectConflict = null
              syncReadOnlyState(s)
            })
          }
          if (!canEditActiveProject()) return false
          const initialSpaceId = safeTimerSpaceId(get().spaces, timer.spaceId)
          if (!canAddTimerToSpace(get().timers, initialSpaceId, { archived: Boolean(timer.archivedAt) })) return false
          let added = false
          set((s) => {
            const spaceId = safeTimerSpaceId(s.spaces, timer.spaceId)
            if (!canAddTimerToSpace(s.timers, spaceId, { archived: Boolean(timer.archivedAt) })) return
            const now = new Date().toISOString()
            const pinned = timer.pinned === true && !timer.archivedAt
            if (pinned) {
              for (const t of s.timers) t.pinned = undefined
            }
            // A caller-supplied id restores a deleted timer (e.g. toast undo) so
            // existing share links keep resolving; otherwise mint a fresh one.
            const requestedId = timer.id && !findTimerById(s.timers, timer.id) ? timer.id : undefined
            s.timers.unshift({
              ...timer,
              spaceId,
              notify: timer.notify ?? true,
              pinned: pinned ? true : undefined,
              id: requestedId ?? newPublicId("timer"),
              createdAt: now,
              updatedAt: now,
            })
            markActiveProjectChanged(s, now)
            added = true
          })
          if (added) persistAndSchedule()
          return added
        },

        removeTimer: (id) => {
          set((s) => {
            s.timers = timersWithoutId(s.timers, id)
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        updateTimer: (id, updates) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const t = findTimerById(s.timers, id)
            if (!t) return
            if ("spaceId" in updates) {
              const nextSpaceId = safeTimerSpaceId(s.spaces, updates.spaceId)
              if (!t.archivedAt && nextSpaceId !== t.spaceId && !canAddTimerToSpace(s.timers, nextSpaceId)) return
            }
            Object.assign(t, updates)
            t.spaceId = safeTimerSpaceId(s.spaces, t.spaceId)
            if (t.archivedAt && t.pinned) t.pinned = undefined
            normalizePinnedTimers(s.timers)
            t.updatedAt = new Date().toISOString()
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        archiveTimer: (id) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const index = findTimerIndexById(s.timers, id)
            const t = s.timers[index]
            if (!t) return
            const now = new Date().toISOString()
            t.archivedAt = now
            t.pinned = undefined
            t.updatedAt = now
            s.timers.splice(index, 1)
            s.timers.push(t)
            markActiveProjectChanged(s, now)
          })
          persistAndSchedule()
        },

        unarchiveTimer: (id) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const t = findTimerById(s.timers, id)
            if (!t) return
            if (t.archivedAt && !canAddTimerToSpace(s.timers, t.spaceId)) return
            const now = new Date().toISOString()
            t.archivedAt = undefined
            t.updatedAt = now
            markActiveProjectChanged(s, now)
          })
          persistAndSchedule()
        },

        duplicateTimer: (id) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const idx = findTimerIndexById(s.timers, id)
            if (idx === -1) return
            const original = s.timers[idx]
            if (!original) return
            const spaceId = safeTimerSpaceId(s.spaces, original.spaceId)
            if (!canAddTimerToSpace(s.timers, spaceId)) return

            const copy: Timer = {
              ...original,
              spaceId,
              id: newPublicId("timer"),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              label: original.label.length > 52 ? `${original.label.slice(0, 52)}...` : original.label,
              sourceShareId: undefined,
              sharedAt: undefined,
              archivedAt: undefined,
              pinned: undefined,
            }
            s.timers.splice(idx + 1, 0, copy)
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        setPinnedTimer: (id) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const now = new Date().toISOString()
            let changed = false

            if (id === null) {
              // Unpin every timer.
              for (const t of s.timers) {
                if (t.pinned === true) {
                  t.pinned = undefined
                  t.updatedAt = now
                  changed = true
                }
              }
            } else {
              // Toggle just this timer; any number of timers may stay pinned.
              const target = findTimerById(s.timers, id)
              if (!target || target.archivedAt) return
              target.pinned = target.pinned === true ? undefined : true
              target.updatedAt = now
              changed = true
            }

            if (!changed) return
            normalizePinnedTimers(s.timers)
            markActiveProjectChanged(s, now)
          })
          persistAndSchedule()
        },

        reorderTimers: (fromIndex, toIndex) => {
          if (!canEditActiveProject()) return
          set((s) => {
            if (fromIndex === toIndex) return
            const next = [...s.timers]
            const [moved] = next.splice(fromIndex, 1)
            if (!moved) return
            next.splice(toIndex, 0, moved)
            normalizePinnedTimers(next)
            s.timers = next
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        reorderVisibleTimers: (orderedIds) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const next = reorderVisibleTimerList(s.timers, s.sortMode, orderedIds)
            if (!next) return
            s.timers = next
            s.sortMode = "manual"
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        clearAllTimers: () => {
          if (!canEditActiveProject()) return
          set((s) => {
            s.timers = []
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        followTimer: ({ shareId, timer }) => {
          if (!shareId) return false
          return get().addTimer({ ...timer, sourceShareId: shareId })
        },

        unfollowTimer: (id) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const t = findTimerById(s.timers, id)
            if (!t) return
            t.sourceShareId = undefined
            t.lastSyncAt = undefined
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        createSpace: (name, color) => {
          if (!canEditActiveProject()) return
          set((s) => {
            if (s.spaces.length >= getEntitlements().maxSpaces) return
            const trimmed = name.trim().slice(0, 30)
            if (!trimmed) return
            s.spaces.push({
              id: newPublicId("space"),
              name: trimmed,
              color,
              createdAt: new Date().toISOString(),
            })
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        updateSpace: (id, updates) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const space = findSpaceById(s.spaces, id)
            if (!space) return
            if (updates.name !== undefined) space.name = updates.name.trim().slice(0, 30) || space.name
            if (updates.color !== undefined) space.color = updates.color
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        deleteSpace: (id) => {
          if (!canEditActiveProject()) return
          set((s) => {
            s.spaces = spacesWithoutId(s.spaces, id)
            for (const t of s.timers) {
              if (t.spaceId === id) t.spaceId = undefined
            }
            if (s.activeSpaceId === id) s.activeSpaceId = null
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        reorderSpaces: (fromIndex, toIndex) => {
          if (!canEditActiveProject()) return
          set((s) => {
            if (fromIndex === toIndex) return
            const next = [...s.spaces]
            const [moved] = next.splice(fromIndex, 1)
            if (!moved) return
            next.splice(toIndex, 0, moved)
            s.spaces = next
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        moveTimerToSpace: (timerId, spaceId) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const t = findTimerById(s.timers, timerId)
            if (!t) return
            const nextSpaceId = safeTimerSpaceId(s.spaces, spaceId ?? undefined)
            if (!t.archivedAt && nextSpaceId !== t.spaceId && !canAddTimerToSpace(s.timers, nextSpaceId)) return
            t.spaceId = nextSpaceId
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        moveTimerToProject: (timerId, targetProjectId) => {
          // Guard: source (active project) must be editable
          if (!canEditActiveProject()) return false

          const state = get()
          const timer = findTimerById(state.timers, timerId)
          const target = state.projects.find((project) => project.id === targetProjectId)
          if (!timer || !target || target.id === state.activeProjectId) return false

          // Guard: target project must also be editable if it is an account project
          if (target.cloudProjectId) {
            const memberships = accountProjectMemberships(state.projects)
            const max = getEntitlements().maxProjects
            if (isProjectReadOnly(memberships, target.cloudProjectId, max)) return false
          }

          // The target project's payload lives in browser storage; load it, append
          // the timer there, and write it back so the move survives without making
          // the target the active project. Spaces are project-scoped, so the moved
          // timer drops its space assignment and any pin state.
          const targetPayload = payloadForProject(target)
          if (targetPayload.timers.length >= getEntitlements().maxTimers) return false

          const now = new Date().toISOString()
          const movedTimer: Timer = { ...timer, spaceId: undefined, pinned: undefined, updatedAt: now }
          const nextTargetTimers = [movedTimer, ...targetPayload.timers]
          normalizePinnedTimers(nextTargetTimers)
          writeProjectPayload(target.id, { ...targetPayload, timers: nextTargetTimers, updatedAt: now })

          let moved = false
          set((s) => {
            const targetMeta = s.projects.find((project) => project.id === targetProjectId)
            if (!targetMeta) return
            targetMeta.updatedAt = now
            targetMeta.hasUnsyncedChanges = true
            targetMeta.timerCount = nextTargetTimers.length
            s.timers = timersWithoutId(s.timers, timerId)
            markActiveProjectChanged(s, now)
            moved = true
          })
          if (moved) persistAndSchedule()
          return moved
        },

        setActiveSpace: (spaceId) => {
          set((s) => {
            s.activeSpaceId = safeActiveSpaceId(spaceId, s.spaces)
          })
          writeBrowserState(get())
        },

        setTimerSortMode: (mode) => {
          set((s) => {
            s.sortMode = safeSortMode(mode)
          })
          writeBrowserState(get())
        },

        setTimerFilterType: (type) => {
          set((s) => {
            s.timerFilters.type = safeTimerFilterType(type)
          })
          writeBrowserState(get())
        },

        setTimerFilter: (filter, enabled) => {
          set((s) => {
            s.timerFilters[filter] = enabled
          })
          writeBrowserState(get())
        },

        clearTimerFilters: () => {
          set((s) => {
            s.timerFilters = { ...DEFAULT_TIMER_FILTERS }
          })
          writeBrowserState(get())
        },

        refreshFollowedTimers: async () => {
          if (refreshFollowedInFlight) return refreshFollowedInFlight

          refreshFollowedInFlight = refreshFollowedTimersOnce()
            .catch(() => {})
            .finally(() => {
              refreshFollowedInFlight = null
            })

          return refreshFollowedInFlight
        },

        refreshAccountProjectsFromCloud: async () => {
          if (!get().hasHydrated) return
          if (accountProjectsInFlight) return accountProjectsInFlight

          const inFlight = refreshAccountProjectsFromCloudOnce()
            .catch((err) => {
              logClientError("store.refreshAccountProjectsFromCloud", err)
            })
            .finally(() => {
              // Sign-out replaces the slot with null so a fresh sign-in can
              // start over; only clear it when it still holds this promise.
              if (accountProjectsInFlight === inFlight) accountProjectsInFlight = null
            })
          accountProjectsInFlight = inFlight

          return accountProjectsInFlight
        },

        createProject: (name) => {
          if (get().projects.length >= MAX_PROJECTS) return
          const now = new Date().toISOString()
          const project = defaultProjectMeta({
            now,
            name: name ?? formatMessage("project.new"),
            hasUnsyncedChanges: true,
          })
          writeProjectPayload(project.id, {
            timers: [],
            spaces: [],
            activeSpaceId: null,
            sortMode: DEFAULT_TIMER_SORT_MODE,
            timerFilters: { ...DEFAULT_TIMER_FILTERS },
            updatedAt: project.updatedAt,
          })
          set((s) => {
            s.projects.unshift(project)
            s.activeProjectId = project.id
            s.timers = []
            s.spaces = []
            s.activeSpaceId = null
            s.sortMode = DEFAULT_TIMER_SORT_MODE
            s.timerFilters = { ...DEFAULT_TIMER_FILTERS }
            s.restoreKey = project.restoreKey
            s.lastSyncAt = null
            s.lastSyncError = null
            s.projectConflict = null
            syncReadOnlyState(s)
          })
          persistAndSchedule(true)
        },

        switchProject: (projectId) => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          const payload = payloadForProject(project)
          set((s) => {
            s.activeProjectId = project.id
            s.timers = payload.timers
            s.spaces = payload.spaces
            s.activeSpaceId = payload.activeSpaceId
            s.sortMode = safeSortMode(payload.sortMode)
            s.timerFilters = safeTimerFilters(payload.timerFilters)
            s.restoreKey = project.restoreKey
            s.lastSyncAt = project.lastSyncedAt ?? null
            s.lastSyncError = null
            s.projectConflict = null
            syncActiveMetaCounts(s)
            syncReadOnlyState(s)
          })
          writeBrowserState(get())
          void get().refreshActiveProjectFromCloud()
        },

        renameActiveProject: (name) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const project = activeProject(s)
            if (!project) return
            project.name = normalizeProjectName(name)
            markActiveProjectChanged(s)
          })
          persistAndSchedule()
        },

        removeActiveProjectFromDevice: () => {
          const current = activeProject(get())
          if (!current) return
          removeProjectPayload(current.id)

          const nextProjects = get().projects.filter((p) => p.id !== current.id)
          const nextProject = nextProjects[0]
          const payload = nextProject ? payloadForProject(nextProject) : null
          set((s) => {
            s.projects = nextProjects
            s.activeProjectId = nextProject?.id ?? null
            s.timers = payload?.timers ?? []
            s.spaces = payload?.spaces ?? []
            s.activeSpaceId = payload?.activeSpaceId ?? null
            s.sortMode = safeSortMode(payload?.sortMode)
            s.timerFilters = safeTimerFilters(payload?.timerFilters)
            s.restoreKey = nextProject?.restoreKey ?? null
            s.lastSyncAt = nextProject?.lastSyncedAt ?? null
            s.lastSyncError = null
            s.projectConflict = null
            syncReadOnlyState(s)
          })
          writeBrowserState(get())
          if (nextProject?.cloudProjectId) void get().refreshActiveProjectFromCloud()
        },

        removeAccountProjectsFromDevice: () => {
          // Invalidate account-scoped requests even when nothing is stored
          // locally: a refresh started before sign-out may still be in flight.
          accountEpoch += 1
          accountProjectsInFlight = null

          const accountProjectIds = get()
            .projects.filter((project) => project.cloudProjectId)
            .map((project) => project.id)
          if (accountProjectIds.length === 0) return

          syncScheduler.cancel()
          const accountProjectIdSet = new Set(accountProjectIds)
          for (const projectId of accountProjectIds) removeProjectPayload(projectId)

          const nextProjects = get().projects.filter((project) => !accountProjectIdSet.has(project.id))
          const currentActiveProjectId = get().activeProjectId
          const nextProject = nextProjects.find((project) => project.id === currentActiveProjectId) ?? nextProjects[0]
          const payload = nextProject ? payloadForProject(nextProject) : null

          set((s) => {
            s.projects = nextProjects
            s.activeProjectId = nextProject?.id ?? null
            s.timers = payload?.timers ?? []
            s.spaces = payload?.spaces ?? []
            s.activeSpaceId = payload?.activeSpaceId ?? null
            s.sortMode = safeSortMode(payload?.sortMode)
            s.timerFilters = safeTimerFilters(payload?.timerFilters)
            s.restoreKey = nextProject?.restoreKey ?? null
            s.lastSyncAt = nextProject?.lastSyncedAt ?? null
            s.lastSyncError = null
            s.projectConflict = null
            syncReadOnlyState(s)
          })
          writeBrowserState(get())
        },

        restoreProjectFromCloud: async (key) => {
          const restoreKey = key.trim()
          if (!isValidRestoreKey(restoreKey)) throw new Error(formatMessage("errors.invalidRestoreKey"))

          const result = await projectCloudClient.restoreProject(restoreKey)
          if (result.status === "not_found") throw new Error(formatMessage("errors.notFound"))
          if (result.status === "unauthenticated") throw new Error(formatMessage("errors.signInRequired"))
          if (result.status === "unsupported") throw new Error(formatMessage("errors.claimUnsupported"))
          const data = result.data
          const restored = data.project
          const restoredSpaces = safeSpaces(restored.spaces)
          const restoredTimers = safeTimersForSpaces(restored.timers, restoredSpaces)
          const now = new Date().toISOString()

          const existing = get().projects.find((p) => p.restoreKey === restoreKey)
          if (!existing && get().projects.length >= MAX_PROJECTS) {
            throw new Error(formatMessage("project.limit.total", { max: MAX_PROJECTS }))
          }

          const project: ProjectMeta = existing
            ? {
                ...existing,
                name: restored.name,
                color: restored.color,
                updatedAt: restored.updatedAt,
                lastSyncedAt: now,
                lastRemoteUpdatedAt: restored.updatedAt,
                hasUnsyncedChanges: false,
                timerCount: restored.timers.length,
                spaceCount: restored.spaces.length,
              }
            : {
                id: newPublicId("project"),
                name: restored.name,
                restoreKey,
                color: restored.color,
                createdAt: now,
                updatedAt: restored.updatedAt,
                lastSyncedAt: now,
                lastRemoteUpdatedAt: restored.updatedAt,
                hasUnsyncedChanges: false,
                timerCount: restored.timers.length,
                spaceCount: restored.spaces.length,
              }

          // Cloud snapshots do not carry a sort mode, so restoring a key that
          // already belongs to a local project must keep the locally
          // persisted preference instead of resetting it to the default.
          const existingPayload = existing ? readProjectPayload(existing.id) : null
          const restoredSortMode = existingPayload ? safeSortMode(existingPayload.sortMode) : DEFAULT_TIMER_SORT_MODE

          writeProjectPayload(project.id, {
            timers: restoredTimers,
            spaces: restoredSpaces,
            activeSpaceId: null,
            sortMode: restoredSortMode,
            timerFilters: { ...DEFAULT_TIMER_FILTERS },
            updatedAt: restored.updatedAt,
          })

          set((s) => {
            s.projects = upsertProject(s.projects, existing, project)
            s.activeProjectId = project.id
            s.timers = restoredTimers
            s.spaces = restoredSpaces
            s.activeSpaceId = null
            s.sortMode = restoredSortMode
            s.timerFilters = { ...DEFAULT_TIMER_FILTERS }
            s.restoreKey = restoreKey
            s.lastSyncAt = now
            s.lastSyncError = null
            s.projectConflict = null
          })
          writeBrowserState(get())
        },

        refreshActiveProjectFromCloud: async () => {
          const startedProjectId = get().activeProjectId
          const access = projectCloudAccess(activeProject(get()), get().restoreKey)
          if (!startedProjectId || !access) return
          if (access.kind === "restore-key" && deadRestoreKeys.has(access.restoreKey)) return
          if (cloudCheckInFlight && cloudCheckProjectId === startedProjectId) return cloudCheckInFlight

          cloudCheckInFlight = refreshActiveProjectFromCloudOnce(startedProjectId, access).finally(() => {
            if (cloudCheckProjectId === startedProjectId) {
              cloudCheckInFlight = null
              cloudCheckProjectId = null
            }
          })

          return cloudCheckInFlight
        },

        useCloudProjectVersion: () => {
          const conflict = get().projectConflict
          if (conflict?.projectId !== get().activeProjectId) return
          const now = new Date().toISOString()
          const remote = conflict.remote
          const remoteSpaces = safeSpaces(remote.spaces)
          const remoteTimers = safeTimersForSpaces(remote.timers, remoteSpaces)

          set((s) => {
            const project = activeProject(s)
            if (!project) return
            project.name = remote.name
            project.color = remote.color
            project.updatedAt = remote.updatedAt
            project.lastRemoteUpdatedAt = remote.updatedAt
            project.lastSyncedAt = now
            project.hasUnsyncedChanges = false
            project.timerCount = remote.timers.length
            project.spaceCount = remote.spaces.length
            s.timers = remoteTimers
            s.spaces = remoteSpaces
            s.activeSpaceId = null
            s.lastSyncAt = now
            s.lastSyncError = null
            s.projectConflict = null
          })
          writeBrowserState(get())
        },

        overwriteCloudProjectVersion: async () => {
          if (!canEditActiveProject()) return
          const saved = await get().syncToCloud({ force: true })
          if (!saved) return
          set((s) => {
            s.projectConflict = null
          })
          writeBrowserState(get())
        },

        deleteActiveProjectFromCloud: async () => {
          const access = projectCloudAccess(activeProject(get()), get().restoreKey)
          if (!access) return
          await clearProjectByAccess(access)
          get().removeActiveProjectFromDevice()
        },

        claimActiveProject: async () => {
          const startedEpoch = accountEpoch
          const current = activeProject(get())
          const restoreKey = get().restoreKey
          if (!current || current.cloudProjectId) return "claimed"
          if (!restoreKey || !isValidRestoreKey(restoreKey)) return "not_found"

          const synced = await get().syncToCloud({ force: true })
          // Sign-out while the claim was running: stop before any state or
          // browser-storage write reintroduces account data.
          if (startedEpoch !== accountEpoch) return "cancelled"
          if (!synced) return "sync_failed"

          const result = await projectCloudClient.claimProject(restoreKey)
          if (startedEpoch !== accountEpoch) return "cancelled"
          if (result.status !== "claimed") return result.status

          const claimed = result.project
          const remote = claimed.project
          const remoteSpaces = safeSpaces(remote.spaces)
          const remoteTimers = safeTimersForSpaces(remote.timers, remoteSpaces)
          const now = new Date().toISOString()

          writeProjectPayload(current.id, {
            timers: remoteTimers,
            spaces: remoteSpaces,
            activeSpaceId: get().activeSpaceId,
            sortMode: get().sortMode,
            timerFilters: get().timerFilters,
            updatedAt: remote.updatedAt,
          })

          set((s) => {
            const project = activeProject(s)
            if (!project || project.id !== current.id) return
            project.name = remote.name
            project.color = remote.color
            project.cloudProjectId = claimed.projectId
            project.ownerId = claimed.owner.id
            project.claimedAt = claimed.claimedAt
            project.updatedAt = remote.updatedAt
            project.lastRemoteUpdatedAt = remote.updatedAt
            project.lastSyncedAt = now
            project.hasUnsyncedChanges = false
            project.timerCount = remote.timers.length
            project.spaceCount = remote.spaces.length
            s.timers = remoteTimers
            s.spaces = remoteSpaces
            s.activeSpaceId = safeActiveSpaceId(s.activeSpaceId, s.spaces)
            s.lastSyncAt = now
            s.lastSyncError = null
            s.projectConflict = null
          })
          writeBrowserState(get())
          // When the claim lands the account over-limit, refresh the project list
          // so the read-only selector sees the full membership immediately.
          // Existing epoch guards inside refreshAccountProjectsFromCloud prevent
          // writes after sign-out.
          const claimStatus = result.overLimit ? "claimed_read_only" : "claimed"
          if (result.overLimit) void get().refreshAccountProjectsFromCloud()
          return claimStatus
        },

        maybeAutoClaimActiveProject: async () => {
          if (autoClaimInFlight) return autoClaimInFlight

          const state = get()
          const current = activeProject(state)
          if (!state.hasHydrated || !current || current.cloudProjectId) return "skipped"
          if (!state.restoreKey || !isValidRestoreKey(state.restoreKey)) return "skipped"
          if (state.timers.length === 0) return "skipped"
          // Respect the per-tab opt-out from the manual claim toast.
          if (isProjectClaimDismissed(current.id)) return "skipped"
          if (autoClaimAttemptedProjectIds.has(current.id)) return "skipped"

          autoClaimAttemptedProjectIds.add(current.id)
          autoClaimInFlight = get()
            .claimActiveProject()
            .finally(() => {
              autoClaimInFlight = null
            })
          return autoClaimInFlight
        },

        setRestoreKey: (key) => {
          if (!canEditActiveProject()) return
          set((s) => {
            const project = activeProject(s)
            if (!project) return
            project.restoreKey = key && isValidRestoreKey(key) ? key : newPublicId("restoreKey")
            s.restoreKey = project.restoreKey
            project.lastRemoteUpdatedAt = undefined
            markActiveProjectChanged(s)
          })
          persistAndSchedule(true)
        },

        regenerateRestoreKey: () => {
          get().setRestoreKey(newPublicId("restoreKey"))
        },

        syncToCloud: async (opts) => {
          const startedEpoch = accountEpoch
          const current = activeProject(get())
          const access = projectCloudAccess(current, get().restoreKey)
          if (!get().hasHydrated || !current || !access) return false
          // Early-return for read-only account projects (over-limit): do not sync.
          // The restore-key path is untouched so pre-claim force-sync in
          // claimActiveProject still works (the project has no cloudProjectId yet).
          if (access.kind === "user-project" && !canEditActiveProject()) return false

          const snapshot = projectSnapshotFromState(get(), current)

          try {
            set((s) => {
              s.lastSyncError = null
              s.isSyncing = true
            })

            const force = opts?.force === true
            const result = await projectCloudClient.saveProject({
              key: access.kind === "restore-key" ? access.restoreKey : undefined,
              projectId: access.kind === "user-project" ? access.projectId : undefined,
              project: snapshot,
              baseUpdatedAt: force ? baseUpdatedAtForForcedSave() : baseUpdatedAtForRegularSave(current),
              force,
            })

            // A save for an account project that finished after sign-out must
            // not stamp meta on whatever project survived the removal.
            if (access.kind === "user-project" && startedEpoch !== accountEpoch) {
              set((s) => {
                s.isSyncing = false
              })
              return false
            }

            if (result.status === "not_found") {
              set((s) => {
                s.lastSyncError = formatMessage("errors.notFound")
                s.isSyncing = false
              })
              writeBrowserState(get())
              return false
            }

            if (result.status === "conflict") {
              set((s) => {
                if (result.project) {
                  s.projectConflict = {
                    projectId: current.id,
                    remote: result.project,
                    source: result.source,
                  }
                }
                s.lastSyncError = formatMessage("project.syncConflict")
                s.isSyncing = false
              })
              writeBrowserState(get())
              return false
            }

            const now = new Date().toISOString()
            // A successful save (re)creates the server-side token, so the key
            // is live again and refreshes may check it.
            if (access.kind === "restore-key") deadRestoreKeys.delete(access.restoreKey)
            set((s) => {
              const project = activeProject(s)
              if (!project) return
              project.lastRemoteUpdatedAt = snapshot.updatedAt
              project.lastSyncedAt = now
              project.hasUnsyncedChanges = false
              project.timerCount = s.timers.length
              project.spaceCount = s.spaces.length
              s.lastSyncAt = now
              s.lastSyncError = null
              s.isSyncing = false
            })
            writeBrowserState(get())
            return true
          } catch (err) {
            logClientError("store.syncToCloud", err)
            set((s) => {
              s.lastSyncError = safeClientErrorMessage(err, "errors.saveFailed")
              s.isSyncing = false
            })
            return false
          }
        },

        restoreFromCloud: async (key) => {
          await get().restoreProjectFromCloud(key)
        },

        clearFromCloud: async () => {
          await get().deleteActiveProjectFromCloud()
        },
      }
    }),
  )

  function persistAndSchedule(immediate = false) {
    writeBrowserState(store.getState())
    scheduleSync(immediate)
  }

  function scheduleSync(immediate = false) {
    if (!canScheduleSync(store.getState())) return
    syncScheduler.schedule(immediate)
  }

  return store
}

const TimerStoreContext = createContext<StoreApi<TimerStore> | null>(null)

export function TimerStoreProvider(props: PropsWithChildren<{ initialState?: TimerStoreInit }>) {
  const [store] = useState(() => createTimerStore(props.initialState))
  useEffect(() => {
    store.getState().hydrateProjectsFromBrowser()
  }, [store])
  return <TimerStoreContext.Provider value={store}>{props.children}</TimerStoreContext.Provider>
}

export function useTimerStore<T>(selector: (store: TimerStore) => T) {
  const store = useContext(TimerStoreContext)
  if (!store) throw new Error("useTimerStore must be used within TimerStoreProvider")
  return useStore(store, selector)
}

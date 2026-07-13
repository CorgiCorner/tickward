import { beforeEach, describe, expect, it, vi } from "vitest"

import { createTimerStore, type TimerStoreInit } from "@/lib/store"
import { dismissProjectClaim } from "@/lib/project-claim-dismissal.client"
import { getEntitlements } from "@/lib/entitlements"
import type { ProjectMeta, UserProjectSummary } from "@/lib/project-model"
import {
  TD_ACTIVE_PROJECT_STORAGE_KEY,
  TD_PROJECTS_STORAGE_KEY,
  readProjectPayload,
  writeProjectPayload,
} from "@/lib/project-storage.client"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { FIXED_NOW, makeProjectSnapshot, makeSpace, makeTimer } from "@/test/factories"

function mockNotFoundFetch() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found.", { status: 404 })))
}

function createHydratedStore(init?: TimerStoreInit) {
  const store = createTimerStore(init)
  store.getState().hydrateProjectsFromBrowser()
  return store
}

async function settleInitialCloudCheck() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  vi.mocked(fetch).mockClear()
}

// Queues one fetch call that stays pending until the returned resolver runs,
// so a test can interleave other store actions with an in-flight request.
function pendingFetchOnce() {
  let resolveFetch!: (response: Response) => void
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
  )
  return (response: Response) => resolveFetch(response)
}

function makeUserProjectSummary(overrides: Partial<UserProjectSummary> = {}): UserProjectSummary {
  return {
    projectId: "project_123",
    name: "Account project",
    ownerId: "user_123",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    timerCount: 1,
    spaceCount: 0,
    ...overrides,
  }
}

function makeAccountProjectMeta(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: "project-local-account",
    name: "Account project",
    restoreKey: "restoreKey_account",
    cloudProjectId: "project_123",
    ownerId: "user_123",
    claimedAt: "2026-05-20T00:00:00.000Z",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    hasUnsyncedChanges: false,
    ...overrides,
  }
}

function makeLocalProjectMeta(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: "project-local-device",
    name: "Device project",
    restoreKey: "restoreKey_device",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    hasUnsyncedChanges: false,
    ...overrides,
  }
}

function getMaybeAutoClaimAction(store: ReturnType<typeof createTimerStore>) {
  const action = store.getState().maybeAutoClaimActiveProject
  expect(action, "expected store action maybeAutoClaimActiveProject").toBeTypeOf("function")
  return action
}

describe("timer store", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW))
    mockNotFoundFetch()
  })

  it("honors the active plan supplied in the initial state", () => {
    createTimerStore({ activePlan: "free" })

    expect(getEntitlements().plan).toBe("free")
  })

  it("hydrates an empty browser without creating a default project", () => {
    const store = createHydratedStore()
    const state = store.getState()

    expect(state.hasHydrated).toBe(true)
    expect(state.projects).toEqual([])
    expect(state.activeProjectId).toBeNull()
    expect(state.sortMode).toBe("soonest")
    expect(state.restoreKey).toBeNull()
    expect(JSON.parse(localStorage.getItem(TD_PROJECTS_STORAGE_KEY) ?? "[]")).toEqual([])
    expect(localStorage.getItem(TD_ACTIVE_PROJECT_STORAGE_KEY)).toBeNull()
  })

  it("creates the first local project only when the first timer is added", () => {
    const store = createHydratedStore()

    const added = store.getState().addTimer({
      label: "Ship",
      targetDate: "2026-05-25T00:00:00.000Z",
      timezone: "UTC",
    })

    const state = store.getState()
    expect(added).toBe(true)
    expect(state.projects).toHaveLength(1)
    expect(state.activeProjectId).toBe(state.projects[0].id)
    expect(state.restoreKey).toBe(state.projects[0].restoreKey)
    expect(state.projects[0].timerCount).toBe(1)
    expect(state.sortMode).toBe("soonest")
    expect(readProjectPayload(state.projects[0].id)).toEqual(
      expect.objectContaining({
        sortMode: "soonest",
        timers: [expect.objectContaining({ notify: true })],
      }),
    )
  })

  it("adds, updates, removes, and clears timers while updating project counts", () => {
    const store = createHydratedStore()

    const added = store.getState().addTimer({
      label: "Ship",
      targetDate: "2026-05-25T00:00:00.000Z",
      timezone: "UTC",
    })
    expect(added).toBe(true)

    const created = store.getState().timers[0]
    expect(created).toEqual(
      expect.objectContaining({
        label: "Ship",
        notify: true,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      }),
    )
    expect(store.getState().projects[0].timerCount).toBe(1)

    store.getState().updateTimer(created.id, { label: "Ship v2" })
    expect(store.getState().timers[0].label).toBe("Ship v2")

    store.getState().removeTimer(created.id)
    expect(store.getState().timers).toEqual([])

    store.getState().addTimer({
      label: "Another",
      targetDate: "2026-05-25T00:00:00.000Z",
      timezone: "UTC",
    })
    store.getState().clearAllTimers()
    expect(store.getState().timers).toEqual([])
  })

  it("restores a caller-supplied timer id unless it is already taken", () => {
    const store = createHydratedStore()

    store.getState().addTimer({
      id: "timer-restored",
      label: "Ship",
      targetDate: "2026-05-25T00:00:00.000Z",
      timezone: "UTC",
    })
    expect(store.getState().timers[0].id).toBe("timer-restored")

    store.getState().addTimer({
      id: "timer-restored",
      label: "Conflict",
      targetDate: "2026-05-25T00:00:00.000Z",
      timezone: "UTC",
    })
    const [conflict, restored] = store.getState().timers
    expect(restored.id).toBe("timer-restored")
    expect(conflict.label).toBe("Conflict")
    expect(conflict.id).not.toBe("timer-restored")
  })

  it("reports when the timer limit prevents adding another timer", () => {
    const store = createHydratedStore({
      timers: Array.from({ length: 20 }, (_, index) => makeTimer({ id: `timer-${index}` })),
    })

    const added = store.getState().addTimer({
      label: "Overflow",
      targetDate: "2026-05-25T00:00:00.000Z",
      timezone: "UTC",
    })

    expect(added).toBe(false)
    expect(store.getState().timers).toHaveLength(20)
    expect(store.getState().timers.some((timer) => timer.label === "Overflow")).toBe(false)
  })

  it("enforces the per-space active timer limit for add and duplicate", () => {
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS_PER_SPACE", "2")
    const store = createHydratedStore({
      spaces: [makeSpace({ id: "space-a" })],
      timers: [
        makeTimer({ id: "timer-a", spaceId: "space-a" }),
        makeTimer({ id: "timer-b", spaceId: "space-a" }),
        makeTimer({ id: "timer-c" }),
      ],
    })

    expect(
      store.getState().addTimer({
        label: "Blocked",
        targetDate: "2026-05-25T00:00:00.000Z",
        timezone: "UTC",
        spaceId: "space-a",
      }),
    ).toBe(false)

    store.getState().duplicateTimer("timer-a")
    expect(store.getState().timers.filter((timer) => timer.spaceId === "space-a")).toHaveLength(2)

    expect(
      store.getState().addTimer({
        label: "Unassigned",
        targetDate: "2026-05-25T00:00:00.000Z",
        timezone: "UTC",
      }),
    ).toBe(true)
  })

  it("enforces the per-space active timer limit for moving and unarchiving", () => {
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS_PER_SPACE", "1")
    const store = createHydratedStore({
      spaces: [makeSpace({ id: "space-a" }), makeSpace({ id: "space-b", name: "Personal" })],
      timers: [
        makeTimer({ id: "timer-a", spaceId: "space-a" }),
        makeTimer({ id: "timer-b", spaceId: "space-b" }),
        makeTimer({ id: "timer-c", spaceId: "space-a", archivedAt: "2026-05-23T00:00:00.000Z" }),
      ],
    })

    store.getState().updateTimer("timer-b", { spaceId: "space-a" })
    expect(store.getState().timers.find((timer) => timer.id === "timer-b")?.spaceId).toBe("space-b")

    store.getState().moveTimerToSpace("timer-b", "space-a")
    expect(store.getState().timers.find((timer) => timer.id === "timer-b")?.spaceId).toBe("space-b")

    store.getState().unarchiveTimer("timer-c")
    expect(store.getState().timers.find((timer) => timer.id === "timer-c")?.archivedAt).toBe("2026-05-23T00:00:00.000Z")

    store.getState().archiveTimer("timer-a")
    store.getState().unarchiveTimer("timer-c")
    expect(store.getState().timers.find((timer) => timer.id === "timer-c")?.archivedAt).toBeUndefined()
  })

  it("moves a timer into another project's payload and clears it from the active project", () => {
    const store = createHydratedStore({
      spaces: [makeSpace({ id: "space-a" })],
      timers: [makeTimer({ id: "timer-x", spaceId: "space-a" })],
    })
    const projectA = store.getState().activeProjectId as string

    store.getState().createProject("Second")
    const projectB = store.getState().activeProjectId as string
    expect(projectB).not.toBe(projectA)
    expect(store.getState().sortMode).toBe("soonest")
    expect(readProjectPayload(projectB)?.sortMode).toBe("soonest")

    store.getState().switchProject(projectA)
    expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-x"])

    const moved = store.getState().moveTimerToProject("timer-x", projectB)

    expect(moved).toBe(true)
    expect(store.getState().timers).toEqual([])
    expect(store.getState().projects.find((project) => project.id === projectA)?.timerCount).toBe(0)

    const targetPayload = readProjectPayload(projectB)
    expect(targetPayload?.timers).toHaveLength(1)
    expect(targetPayload?.timers[0]?.id).toBe("timer-x")
    expect(targetPayload?.timers[0]?.spaceId).toBeUndefined()
    expect(store.getState().projects.find((project) => project.id === projectB)?.hasUnsyncedChanges).toBe(true)
    expect(store.getState().projects.find((project) => project.id === projectB)?.timerCount).toBe(1)
  })

  it("refuses to move a timer into a project that is already at the timer limit", () => {
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS", "1")
    const store = createHydratedStore({ timers: [makeTimer({ id: "timer-x" })] })
    const projectA = store.getState().activeProjectId as string

    store.getState().createProject("Second")
    const projectB = store.getState().activeProjectId as string
    store.getState().addTimer({ label: "Filler", targetDate: "2026-05-25T00:00:00.000Z", timezone: "UTC" })

    store.getState().switchProject(projectA)
    const moved = store.getState().moveTimerToProject("timer-x", projectB)

    expect(moved).toBe(false)
    expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-x"])
  })

  it("enforces the configured space limit", () => {
    const store = createHydratedStore()

    store.getState().createSpace("Work")
    store.getState().createSpace("Personal")
    store.getState().createSpace("Overflow")

    expect(store.getState().spaces.map((space) => space.name)).toEqual(["Work", "Personal"])
  })

  it("archives timers by moving them to the bottom and clearing pinned state", () => {
    const pinned = makeTimer({ id: "timer-a", label: "Pinned", pinned: true })
    const regular = makeTimer({ id: "timer-b", label: "Regular" })
    const store = createHydratedStore({ timers: [pinned, regular] })

    store.getState().archiveTimer("timer-a")

    expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-b", "timer-a"])
    expect(store.getState().timers[1]).toEqual(
      expect.objectContaining({
        archivedAt: FIXED_NOW,
        pinned: undefined,
        updatedAt: FIXED_NOW,
      }),
    )

    store.getState().unarchiveTimer("timer-a")
    expect(store.getState().timers[1].archivedAt).toBeUndefined()
  })

  it("pins a timer, moves it to the top, and toggles it off", () => {
    const store = createHydratedStore({
      timers: [
        makeTimer({ id: "timer-a", label: "A" }),
        makeTimer({ id: "timer-b", label: "B" }),
        makeTimer({ id: "timer-c", label: "C" }),
      ],
    })

    store.getState().setPinnedTimer("timer-b")

    expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-b", "timer-a", "timer-c"])
    expect(store.getState().timers.map((timer) => timer.pinned === true)).toEqual([true, false, false])

    store.getState().setPinnedTimer("timer-b")
    expect(store.getState().timers.every((timer) => timer.pinned !== true)).toBe(true)
  })

  it("allows pinning multiple timers, floating them to the top in order", () => {
    const store = createHydratedStore({
      timers: [
        makeTimer({ id: "timer-a", label: "A" }),
        makeTimer({ id: "timer-b", label: "B" }),
        makeTimer({ id: "timer-c", label: "C" }),
      ],
    })

    store.getState().setPinnedTimer("timer-b")
    store.getState().setPinnedTimer("timer-c")

    expect(
      store
        .getState()
        .timers.filter((timer) => timer.pinned === true)
        .map((timer) => timer.id),
    ).toEqual(["timer-b", "timer-c"])
    expect(store.getState().timers[0]?.id).toBe("timer-b")
    expect(store.getState().timers[1]?.id).toBe("timer-c")
  })

  it("normalizes duplicate and archived pinned timers on hydrate", () => {
    const store = createHydratedStore({
      timers: [
        makeTimer({ id: "timer-a", pinned: true, archivedAt: "2026-05-23T00:00:00.000Z" }),
        makeTimer({ id: "timer-b", pinned: true }),
        makeTimer({ id: "timer-c", pinned: true }),
      ],
    })

    expect(store.getState().timers.map((timer) => [timer.id, timer.pinned])).toEqual([
      ["timer-b", true],
      ["timer-c", true],
      ["timer-a", undefined],
    ])
  })

  it("duplicates timers as editable, unarchived, unpinned copies", () => {
    const store = createHydratedStore({
      timers: [
        makeTimer({
          id: "timer-a",
          label: "Followed archived pinned",
          sourceShareId: "share-a",
          archivedAt: "2026-05-23T00:00:00.000Z",
          pinned: true,
        }),
      ],
    })

    store.getState().duplicateTimer("timer-a")
    const copy = store.getState().timers[1]

    expect(copy).toEqual(
      expect.objectContaining({
        label: "Followed archived pinned",
        sourceShareId: undefined,
        archivedAt: undefined,
        pinned: undefined,
      }),
    )
    expect(copy.id).not.toBe("timer-a")
  })

  it("persists local organizer preferences per project payload", () => {
    const store = createHydratedStore({
      spaces: [makeSpace({ id: "space-a" })],
      timers: [makeTimer({ id: "timer-a", spaceId: "space-a" }), makeTimer({ id: "timer-b", spaceId: undefined })],
    })

    store.getState().setActiveSpace(UNASSIGNED_SPACE_ID)
    store.getState().setTimerSortMode("soonest")
    store.getState().setTimerFilterType("countUp")
    store.getState().setTimerFilter("muted", true)

    const payload = readProjectPayload(store.getState().activeProjectId ?? "")
    expect(store.getState().activeSpaceId).toBe(UNASSIGNED_SPACE_ID)
    expect(store.getState().sortMode).toBe("soonest")
    expect(store.getState().timerFilters).toEqual({
      type: "countUp",
      pinned: false,
      muted: true,
      shared: false,
      recurring: false,
    })
    expect(payload).toEqual(
      expect.objectContaining({
        activeSpaceId: UNASSIGNED_SPACE_ID,
        sortMode: "soonest",
        timerFilters: {
          type: "countUp",
          pinned: false,
          muted: true,
          shared: false,
          recurring: false,
        },
      }),
    )
  })

  it("removes the last local project without creating a replacement", () => {
    const store = createHydratedStore()
    store.getState().addTimer({
      label: "Ship",
      targetDate: "2026-05-25T00:00:00.000Z",
      timezone: "UTC",
    })
    const projectId = store.getState().activeProjectId ?? ""

    store.getState().removeActiveProjectFromDevice()

    expect(store.getState()).toEqual(
      expect.objectContaining({
        projects: [],
        activeProjectId: null,
        timers: [],
        spaces: [],
        restoreKey: null,
      }),
    )
    expect(readProjectPayload(projectId)).toBeNull()
    expect(JSON.parse(localStorage.getItem(TD_PROJECTS_STORAGE_KEY) ?? "[]")).toEqual([])
    expect(localStorage.getItem(TD_ACTIVE_PROJECT_STORAGE_KEY)).toBeNull()
  })

  it("removes account-backed projects from the device without touching unclaimed projects", () => {
    const store = createHydratedStore()
    store.getState().addTimer({
      label: "Unclaimed",
      targetDate: "2026-05-25T00:00:00.000Z",
      timezone: "UTC",
    })
    const unclaimedProject = store.getState().projects[0]
    const accountProject = {
      id: "local-account-project",
      name: "Account project",
      restoreKey: "restoreKey_456",
      cloudProjectId: "project_123",
      ownerId: "user_123",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }
    localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([accountProject, unclaimedProject]))
    localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, accountProject.id)
    const reloadedStore = createHydratedStore()

    reloadedStore.getState().removeAccountProjectsFromDevice()

    expect(reloadedStore.getState().projects).toEqual([expect.objectContaining({ id: unclaimedProject.id })])
    expect(reloadedStore.getState().activeProjectId).toBe(unclaimedProject.id)
    expect(reloadedStore.getState().timers).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(TD_PROJECTS_STORAGE_KEY) ?? "[]")).toEqual([
      expect.objectContaining({ id: unclaimedProject.id }),
    ])
    expect(readProjectPayload(accountProject.id)).toBeNull()
  })

  it("loads account projects into an empty local registry after sign-in", async () => {
    const store = createHydratedStore()
    const remoteProject = makeProjectSnapshot({
      name: "Main",
      timers: [makeTimer({ id: "timer-main" })],
      spaces: [makeSpace({ id: "space-main" })],
      updatedAt: "2026-06-05T21:11:37.795Z",
    })
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          projects: [
            {
              projectId: "project_123",
              name: "Main",
              ownerId: "user_123",
              createdAt: "2026-06-05T20:50:40.519Z",
              updatedAt: "2026-06-05T21:11:37.795Z",
              timerCount: 16,
              spaceCount: 1,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          project: remoteProject,
          source: "project",
          projectId: "project_123",
          ownerId: "user_123",
        }),
      )

    await store.getState().refreshAccountProjectsFromCloud()

    const state = store.getState()
    expect(state.projects).toHaveLength(1)
    expect(state.projects[0]).toEqual(
      expect.objectContaining({
        name: "Main",
        cloudProjectId: "project_123",
        ownerId: "user_123",
        timerCount: 1,
        spaceCount: 1,
        lastRemoteUpdatedAt: "2026-06-05T21:11:37.795Z",
      }),
    )
    expect(state.activeProjectId).toBe(state.projects[0].id)
    expect(state.timers).toHaveLength(1)
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      "/api/projects/list",
      "/api/projects/restore?projectId=project_123",
    ])
  })

  it("reorders a visible subset and switches back to manual sorting", () => {
    const store = createHydratedStore({
      sortMode: "soonest",
      timers: [
        makeTimer({ id: "timer-a", label: "A", spaceId: "space-a" }),
        makeTimer({ id: "timer-b", label: "B" }),
        makeTimer({ id: "timer-c", label: "C", spaceId: "space-a" }),
        makeTimer({ id: "timer-d", label: "D", archivedAt: "2026-05-23T00:00:00.000Z" }),
      ],
    })

    store.getState().reorderVisibleTimers(["timer-c", "timer-a"])

    expect(store.getState().sortMode).toBe("manual")
    expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-c", "timer-b", "timer-a", "timer-d"])
  })

  it("restores a cloud project and writes the selected project payload", async () => {
    const remoteProject = makeProjectSnapshot({
      name: "Restored",
      timers: [
        makeTimer({ id: "timer-a", pinned: true, archivedAt: "2026-05-23T00:00:00.000Z" }),
        makeTimer({ id: "timer-b", pinned: true }),
      ],
    })
    const store = createHydratedStore()
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ project: remoteProject, source: "project" }))

    await store.getState().restoreProjectFromCloud("restoreKey_123")

    const state = store.getState()
    expect(state.restoreKey).toBe("restoreKey_123")
    expect(state.projects[0]).toEqual(
      expect.objectContaining({
        name: "Restored",
        hasUnsyncedChanges: false,
        timerCount: 2,
      }),
    )
    expect(state.timers.map((timer) => [timer.id, timer.pinned])).toEqual([
      ["timer-b", true],
      ["timer-a", undefined],
    ])
    expect(state.sortMode).toBe("soonest")
    expect(readProjectPayload(state.projects[0].id)).toEqual(
      expect.objectContaining({
        sortMode: "soonest",
        timers: expect.arrayContaining([expect.objectContaining({ id: "timer-a" })]),
      }),
    )
  })

  it("keeps an explicitly persisted manual sort mode when restoring an existing project's key", async () => {
    const store = createHydratedStore({ sortMode: "manual", timers: [makeTimer({ id: "timer-a" })] })
    await settleInitialCloudCheck()
    const restoreKey = store.getState().restoreKey as string
    const remoteProject = makeProjectSnapshot({ name: "Synced", timers: [makeTimer({ id: "timer-b" })] })
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ project: remoteProject, source: "project" }))

    await store.getState().restoreProjectFromCloud(restoreKey)

    expect(store.getState().sortMode).toBe("manual")
    expect(readProjectPayload(store.getState().projects[0].id)?.sortMode).toBe("manual")
  })

  it("records project conflicts on sync 409 responses", async () => {
    const store = createHydratedStore({ timers: [makeTimer({ id: "timer-a" })] })
    const conflictProject = makeProjectSnapshot({ updatedAt: "2026-05-24T10:00:00.000Z" })
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json(
        {
          project: conflictProject,
          source: "project",
        },
        { status: 409 },
      ),
    )

    const synced = await store.getState().syncToCloud()

    expect(synced).toBe(false)
    expect(store.getState().projectConflict).toEqual({
      projectId: store.getState().activeProjectId,
      remote: conflictProject,
      source: "project",
    })
    expect(store.getState().lastSyncError).toBe("Cloud version changed.")
  })

  it("does not store technical sync errors for user-facing surfaces", async () => {
    const store = createHydratedStore({ timers: [makeTimer({ id: "timer-a" })] })
    await settleInitialCloudCheck()
    vi.mocked(fetch).mockRejectedValueOnce(new Error("internal database failure"))

    const synced = await store.getState().syncToCloud()

    expect(synced).toBe(false)
    expect(store.getState().lastSyncError).toBe("Save failed.")
  })

  it("keeps restore-key not_found saves as failed syncs", async () => {
    const store = createHydratedStore({ timers: [makeTimer({ id: "timer-a" })] })
    await settleInitialCloudCheck()
    vi.mocked(fetch).mockResolvedValueOnce(new Response("Not found.", { status: 404 }))

    const synced = await store.getState().syncToCloud()

    expect(synced).toBe(false)
    expect(store.getState().lastSyncError).toBe("Not found.")
    expect(store.getState().projects[0].hasUnsyncedChanges).toBe(true)
  })

  it("keeps a stale account project id intact when refresh returns 404 (no strip)", async () => {
    localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, "project-local")
    localStorage.setItem(
      TD_PROJECTS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "project-local",
          name: "Main",
          restoreKey: "restoreKey_123",
          cloudProjectId: "project_stale",
          ownerId: "user_123",
          claimedAt: "2026-06-05T08:00:00.000Z",
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
          hasUnsyncedChanges: false,
        },
      ]),
    )

    const store = createHydratedStore()
    await settleInitialCloudCheck()

    // A not_found on an account project must NOT demote it to a local
    // restore-key project: demoting + re-uploading would mint a duplicate.
    // The account identity is retained; a transient 404 self-heals next fetch.
    const project = store.getState().projects[0]
    expect(project.cloudProjectId).toBe("project_stale")
    expect(project.ownerId).toBe("user_123")
    expect(project.claimedAt).toBe("2026-06-05T08:00:00.000Z")
  })

  it("does not re-upload (mint) an account project whose refresh returns 404", async () => {
    const accountProject = makeAccountProjectMeta({ hasUnsyncedChanges: true })
    localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([accountProject]))
    localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, accountProject.id)
    writeProjectPayload(accountProject.id, {
      timers: [makeTimer({ id: "timer-a" })],
      spaces: [],
      activeSpaceId: null,
      sortMode: "soonest",
      timerFilters: { type: "all", pinned: false, muted: false, shared: false, recurring: false },
      updatedAt: FIXED_NOW,
    })

    // The account-project refresh 404s (default mock). Pre-fix this demoted the
    // project to local and force-synced it, minting a new server project.
    const store = createHydratedStore()
    await store.getState().refreshActiveProjectFromCloud()

    const project = store.getState().projects[0]
    expect(project.cloudProjectId).toBe(accountProject.cloudProjectId)
    expect(project.ownerId).toBe("user_123")
    const saveCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/projects/save")
    expect(saveCalls).toHaveLength(0)
  })

  describe("dead restore keys", () => {
    function restoreCalls() {
      return vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/api/projects/restore"))
    }

    it("removes an empty project resurrected from the restore-key cookie when its key is dead", async () => {
      const store = createHydratedStore({ restoreKey: "restoreKey_ghost" })
      expect(store.getState().projects).toHaveLength(1)

      await store.getState().refreshActiveProjectFromCloud()

      expect(store.getState().projects).toEqual([])
      expect(store.getState().activeProjectId).toBeNull()
      expect(JSON.parse(localStorage.getItem(TD_PROJECTS_STORAGE_KEY) ?? "[]")).toEqual([])
      expect(document.cookie).not.toContain("restoreKey_ghost")
    })

    it("keeps a legacy cookie project with timers when its key is dead", async () => {
      const store = createHydratedStore({
        restoreKey: "restoreKey_ghost",
        timers: [makeTimer({ id: "timer-a" })],
      })

      await store.getState().refreshActiveProjectFromCloud()

      expect(store.getState().projects).toHaveLength(1)
      expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-a"])
    })

    it("keeps a freshly created empty project whose key has never been synced", async () => {
      const store = createHydratedStore()
      store.getState().createProject("Fresh")

      await store.getState().refreshActiveProjectFromCloud()

      expect(store.getState().projects).toHaveLength(1)
      expect(store.getState().projects[0].name).toBe("Fresh")
    })

    it("stops re-checking a restore key after the server reported it not_found", async () => {
      const localProject = makeLocalProjectMeta()
      localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([localProject]))
      localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, localProject.id)

      const store = createHydratedStore()
      await store.getState().refreshActiveProjectFromCloud()
      expect(restoreCalls()).toHaveLength(1)
      vi.mocked(fetch).mockClear()

      await store.getState().refreshActiveProjectFromCloud()

      expect(restoreCalls()).toHaveLength(0)
      expect(store.getState().projects).toHaveLength(1)
    })

    it("re-checks a dead restore key again after a successful save revives it", async () => {
      const localProject = makeLocalProjectMeta()
      localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([localProject]))
      localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, localProject.id)

      const store = createHydratedStore()
      await store.getState().refreshActiveProjectFromCloud()
      store.getState().addTimer({ label: "Ship", targetDate: "2026-05-25T00:00:00.000Z", timezone: "UTC" })

      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))
      await expect(store.getState().syncToCloud({ force: true })).resolves.toBe(true)
      vi.mocked(fetch).mockClear()

      await store.getState().refreshActiveProjectFromCloud()

      expect(restoreCalls()).toHaveLength(1)
    })
  })

  it("does not promote restore-key imports into account-backed project access", async () => {
    const store = createHydratedStore()
    await settleInitialCloudCheck()
    const restored = makeProjectSnapshot({ name: "Imported" })
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        project: restored,
        source: "project",
        projectId: "project_internal_123",
        ownerId: "user_123",
      }),
    )

    await store.getState().restoreProjectFromCloud("restoreKey_456")

    const project = store.getState().projects.find((item) => item.restoreKey === "restoreKey_456")
    expect(project).toEqual(
      expect.objectContaining({
        name: "Imported",
        restoreKey: "restoreKey_456",
      }),
    )
    expect(project?.cloudProjectId).toBeUndefined()
    expect(project?.ownerId).toBeUndefined()
  })

  it("claims anonymous projects and syncs future changes by account project id", async () => {
    const timer = makeTimer({ id: "timer-a" })
    const store = createHydratedStore({ timers: [timer] })
    await settleInitialCloudCheck()
    const activeProjectId = store.getState().activeProjectId ?? ""
    const claimedSnapshot = makeProjectSnapshot({
      name: "Claimed",
      timers: [timer],
      updatedAt: FIXED_NOW,
    })

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          project: {
            projectId: "project_123",
            project: claimedSnapshot,
            owner: { id: "user_123", email: "ada@example.com" },
            claimedAt: "2026-06-05T08:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(store.getState().claimActiveProject()).resolves.toBe("claimed")

    expect(store.getState().projects.find((project) => project.id === activeProjectId)).toEqual(
      expect.objectContaining({
        cloudProjectId: "project_123",
        ownerId: "user_123",
        claimedAt: "2026-06-05T08:00:00.000Z",
        hasUnsyncedChanges: false,
      }),
    )

    store.getState().updateTimer("timer-a", { label: "After claim" })
    await expect(store.getState().syncToCloud({ force: true })).resolves.toBe(true)

    const postClaimSaveBody = JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as string)
    expect(postClaimSaveBody.projectId).toBe("project_123")
    expect(postClaimSaveBody.force).toBe(true)
    expect(postClaimSaveBody).not.toHaveProperty("key")
  })

  describe("account sign-out races", () => {
    it("discards a late account project refresh that resolves after sign-out removal", async () => {
      const accountProject = makeAccountProjectMeta()
      const localProject = makeLocalProjectMeta()
      localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([accountProject, localProject]))
      localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, localProject.id)
      writeProjectPayload(accountProject.id, {
        timers: [makeTimer({ id: "timer-account" })],
        spaces: [],
        activeSpaceId: null,
        sortMode: "soonest",
        timerFilters: { type: "all", pinned: false, muted: false, shared: false, recurring: false },
        updatedAt: FIXED_NOW,
      })
      const store = createHydratedStore()
      await settleInitialCloudCheck()

      const resolveList = pendingFetchOnce()
      const refreshPromise = store.getState().refreshAccountProjectsFromCloud()

      store.getState().removeAccountProjectsFromDevice()
      expect(store.getState().projects.map((project) => project.id)).toEqual([localProject.id])

      resolveList(Response.json({ projects: [makeUserProjectSummary()] }))
      await refreshPromise

      const state = store.getState()
      expect(state.projects.some((project) => project.cloudProjectId)).toBe(false)
      expect(state.activeProjectId).toBe(localProject.id)
      const registry = JSON.parse(localStorage.getItem(TD_PROJECTS_STORAGE_KEY) ?? "[]") as Array<{
        cloudProjectId?: string
      }>
      expect(registry.some((project) => project.cloudProjectId)).toBe(false)
      expect(readProjectPayload(accountProject.id)).toBeNull()
    })

    it("ignores a late account refresh when sign-out happened with nothing on the device", async () => {
      const store = createHydratedStore()

      const resolveList = pendingFetchOnce()
      const refreshPromise = store.getState().refreshAccountProjectsFromCloud()

      store.getState().removeAccountProjectsFromDevice()

      resolveList(Response.json({ projects: [makeUserProjectSummary()] }))
      await refreshPromise

      expect(store.getState().projects).toEqual([])
      expect(store.getState().activeProjectId).toBeNull()
      expect(JSON.parse(localStorage.getItem(TD_PROJECTS_STORAGE_KEY) ?? "[]")).toEqual([])
    })

    it("starts a fresh account refresh after sign-out cancelled the previous one", async () => {
      const store = createHydratedStore()

      const resolveStaleList = pendingFetchOnce()
      const staleRefresh = store.getState().refreshAccountProjectsFromCloud()

      store.getState().removeAccountProjectsFromDevice()

      vi.mocked(fetch)
        .mockResolvedValueOnce(Response.json({ projects: [makeUserProjectSummary({ name: "Fresh" })] }))
        .mockResolvedValueOnce(
          Response.json({
            project: makeProjectSnapshot({ name: "Fresh", timers: [makeTimer({ id: "timer-fresh" })] }),
            source: "project",
            projectId: "project_123",
            ownerId: "user_123",
          }),
        )
      const refreshAgain = store.getState().refreshAccountProjectsFromCloud()

      resolveStaleList(Response.json({ projects: [makeUserProjectSummary({ name: "Stale" })] }))
      await staleRefresh
      await refreshAgain

      const listCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/projects/list")
      expect(listCalls).toHaveLength(2)
      expect(store.getState().projects[0]).toEqual(
        expect.objectContaining({ name: "Fresh", cloudProjectId: "project_123" }),
      )
      expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-fresh"])
    })

    it("resets cloud-check state when a user-project refresh resolves after sign-out", async () => {
      const accountProject = makeAccountProjectMeta()
      const localProject = makeLocalProjectMeta()
      localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([accountProject, localProject]))
      localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, accountProject.id)

      const resolveRestore = pendingFetchOnce()
      const store = createHydratedStore()
      const refreshPromise = store.getState().refreshActiveProjectFromCloud()

      store.getState().removeAccountProjectsFromDevice()
      expect(store.getState().activeProjectId).toBe(localProject.id)

      resolveRestore(
        Response.json({
          project: makeProjectSnapshot({ name: "Account project", timers: [makeTimer({ id: "timer-account" })] }),
          source: "project",
          projectId: "project_123",
          ownerId: "user_123",
        }),
      )
      await refreshPromise

      const state = store.getState()
      expect(state.timers.some((timer) => timer.id === "timer-account")).toBe(false)
      expect(state.isCheckingCloud).toBe(false)
      expect(state.lastSyncError).toBeNull()
      expect(state.projects).toEqual([expect.objectContaining({ id: localProject.id })])
    })

    it("does not stamp surviving local project meta when an account sync resolves after sign-out", async () => {
      const accountProject = makeAccountProjectMeta()
      const localProject = makeLocalProjectMeta({ hasUnsyncedChanges: true })
      localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([accountProject, localProject]))
      localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, accountProject.id)
      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json({
          project: makeProjectSnapshot({
            name: "Account project",
            timers: [makeTimer({ id: "timer-account" })],
            updatedAt: "2026-05-23T00:00:00.000Z",
          }),
          source: "project",
          projectId: "project_123",
          ownerId: "user_123",
        }),
      )
      const store = createHydratedStore()
      await store.getState().refreshActiveProjectFromCloud()
      vi.mocked(fetch).mockClear()

      const resolveSave = pendingFetchOnce()
      const syncPromise = store.getState().syncToCloud()

      store.getState().removeAccountProjectsFromDevice()

      resolveSave(new Response(null, { status: 200 }))
      await expect(syncPromise).resolves.toBe(false)

      const survivor = store.getState().projects.find((project) => project.id === localProject.id)
      expect(survivor?.hasUnsyncedChanges).toBe(true)
      expect(survivor?.lastSyncedAt).toBeUndefined()
      expect(survivor?.lastRemoteUpdatedAt).toBeUndefined()
      expect(store.getState().isSyncing).toBe(false)
    })

    it("still applies a pending restore-key refresh after an anonymous mount cleanup", async () => {
      const resolveRestore = pendingFetchOnce()
      const store = createHydratedStore({ timers: [makeTimer({ id: "timer-a" })] })
      const refreshPromise = store.getState().refreshActiveProjectFromCloud()

      store.getState().removeAccountProjectsFromDevice()

      resolveRestore(
        Response.json({
          project: makeProjectSnapshot({
            name: "Synced",
            timers: [makeTimer({ id: "timer-remote" })],
            updatedAt: FIXED_NOW,
          }),
          source: "project",
        }),
      )
      await refreshPromise

      expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-remote"])
      expect(store.getState().projects[0]).toEqual(
        expect.objectContaining({ name: "Synced", hasUnsyncedChanges: false }),
      )
      expect(store.getState().isCheckingCloud).toBe(false)
    })

    it("keeps the cloud-check flag for a newer project's refresh when a stale one resolves", async () => {
      const projectA = makeAccountProjectMeta()
      const projectB = makeAccountProjectMeta({
        id: "project-local-account-b",
        name: "Second account project",
        restoreKey: "restoreKey_account_b",
        cloudProjectId: "project_456",
      })
      localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([projectA, projectB]))
      localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, projectA.id)

      const resolveStale = pendingFetchOnce()
      const store = createHydratedStore()
      const staleRefresh = store.getState().refreshActiveProjectFromCloud()

      const resolveFresh = pendingFetchOnce()
      store.getState().switchProject(projectB.id)
      const freshRefresh = store.getState().refreshActiveProjectFromCloud()

      resolveStale(
        Response.json({
          project: makeProjectSnapshot({ name: "Stale account project" }),
          source: "project",
          projectId: "project_123",
          ownerId: "user_123",
        }),
      )
      await staleRefresh
      expect(store.getState().isCheckingCloud).toBe(true)

      resolveFresh(
        Response.json({
          project: makeProjectSnapshot({ name: "Second account project", updatedAt: FIXED_NOW }),
          source: "project",
          projectId: "project_456",
          ownerId: "user_123",
        }),
      )
      await freshRefresh

      expect(store.getState().isCheckingCloud).toBe(false)
      expect(store.getState().activeProjectId).toBe(projectB.id)
    })
  })

  describe("over-limit read-only guards", () => {
    function makeOverLimitStore() {
      // Use env limit of 1 so we can build a minimal over-limit scenario.
      vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_PROJECTS", "1")
      // Two account projects: older (index 0) is within limit, newer (index 1) is over-limit.
      const olderAccountProject = makeAccountProjectMeta({
        id: "project-local-older",
        name: "Older project",
        restoreKey: "restoreKey_older",
        cloudProjectId: "project_older",
        claimedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      const newerAccountProject = makeAccountProjectMeta({
        id: "project-local-newer",
        name: "Newer project",
        restoreKey: "restoreKey_newer",
        cloudProjectId: "project_newer",
        claimedAt: "2026-06-01T00:00:00.000Z",
        createdAt: "2026-06-01T00:00:00.000Z",
      })
      // Active project is the newer (over-limit) one
      const store = createHydratedStore({ timers: [makeTimer({ id: "timer-a" })] })
      store.setState({
        projects: [olderAccountProject, newerAccountProject],
        activeProjectId: newerAccountProject.id,
      })
      return { store, olderAccountProject, newerAccountProject }
    }

    it("addTimer returns false when active project is read-only (over limit)", () => {
      const { store } = makeOverLimitStore()

      const added = store.getState().addTimer({
        label: "Blocked",
        targetDate: "2026-05-25T00:00:00.000Z",
        timezone: "UTC",
      })

      expect(added).toBe(false)
    })

    it("updateTimer is a no-op when active project is read-only", () => {
      const { store } = makeOverLimitStore()
      const timerBefore = store.getState().timers[0]

      store.getState().updateTimer(timerBefore.id, { label: "Changed" })

      expect(store.getState().timers[0].label).toBe(timerBefore.label)
    })

    it("createSpace is a no-op when active project is read-only", () => {
      const { store } = makeOverLimitStore()

      store.getState().createSpace("New space")

      expect(store.getState().spaces).toHaveLength(0)
    })

    it("renameActiveProject is a no-op when active project is read-only", () => {
      const { store, newerAccountProject } = makeOverLimitStore()

      store.getState().renameActiveProject("New name")

      const project = store.getState().projects.find((p) => p.id === newerAccountProject.id)
      expect(project?.name).toBe(newerAccountProject.name)
    })

    it("removeActiveProjectFromDevice still works for a read-only project", () => {
      const { store, newerAccountProject } = makeOverLimitStore()

      store.getState().removeActiveProjectFromDevice()

      expect(store.getState().projects.some((p) => p.id === newerAccountProject.id)).toBe(false)
    })

    it("deleteActiveProjectFromCloud still works for a read-only project", async () => {
      const { store } = makeOverLimitStore()
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

      // Should not throw even for a read-only project
      await expect(store.getState().deleteActiveProjectFromCloud()).resolves.toBeUndefined()
    })

    it("moveTimerToProject into a read-only target is refused", () => {
      vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_PROJECTS", "1")
      const olderAccountProject = makeAccountProjectMeta({
        id: "project-local-older",
        name: "Older project",
        restoreKey: "restoreKey_older",
        cloudProjectId: "project_older",
        claimedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      const newerAccountProject = makeAccountProjectMeta({
        id: "project-local-newer",
        name: "Newer project",
        restoreKey: "restoreKey_newer",
        cloudProjectId: "project_newer",
        claimedAt: "2026-06-01T00:00:00.000Z",
        createdAt: "2026-06-01T00:00:00.000Z",
      })
      const store = createHydratedStore({ timers: [makeTimer({ id: "timer-x" })] })
      store.setState({
        projects: [olderAccountProject, newerAccountProject],
        // Active is the older (editable) project
        activeProjectId: olderAccountProject.id,
      })

      // Try to move timer into the newer (over-limit, read-only) project
      const moved = store.getState().moveTimerToProject("timer-x", newerAccountProject.id)

      expect(moved).toBe(false)
    })

    it("syncToCloud returns false without fetching for a read-only account project", async () => {
      const { store } = makeOverLimitStore()
      vi.mocked(fetch).mockClear()

      const synced = await store.getState().syncToCloud()

      expect(synced).toBe(false)
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })
  })

  describe("registry trim and account meta regression", () => {
    it("refresh with MAX_PROJECTS+1 account summaries keeps all account metas and the local meta", async () => {
      // Use limit of 2 to keep fixture small
      vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_PROJECTS", "2")

      const localProject = makeLocalProjectMeta({ id: "project-local-device" })
      localStorage.setItem(
        TD_PROJECTS_STORAGE_KEY,
        JSON.stringify([
          localProject,
          makeAccountProjectMeta({
            id: "project-acc-0",
            restoreKey: "restoreKey_acc0",
            cloudProjectId: "project_acc0",
          }),
          makeAccountProjectMeta({
            id: "project-acc-1",
            restoreKey: "restoreKey_acc1",
            cloudProjectId: "project_acc1",
          }),
        ]),
      )
      localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, localProject.id)

      const store = createHydratedStore()
      await settleInitialCloudCheck()

      // Server returns 3 account projects (max+1 = 3), all should be kept
      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json({
          projects: [
            makeUserProjectSummary({ projectId: "project_acc0", name: "Acc 0" }),
            makeUserProjectSummary({ projectId: "project_acc1", name: "Acc 1" }),
            makeUserProjectSummary({ projectId: "project_acc2", name: "Acc 2", createdAt: "2026-07-01T00:00:00.000Z" }),
          ],
        }),
      )

      await store.getState().refreshAccountProjectsFromCloud()

      const state = store.getState()
      // All 3 account projects must be present (not sliced to 2)
      const accountProjects = state.projects.filter((p) => p.cloudProjectId)
      expect(accountProjects).toHaveLength(3)
      // Local project must also be preserved
      expect(state.projects.some((p) => p.id === localProject.id)).toBe(true)
    })

    it("summary to meta mapping preserves claimedAt and createdAt from existing local meta", async () => {
      const existingMeta = makeAccountProjectMeta({
        id: "project-local-existing",
        cloudProjectId: "project_123",
        claimedAt: "2026-05-20T00:00:00.000Z",
        createdAt: "2026-05-19T00:00:00.000Z",
      })
      localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([existingMeta]))
      localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, existingMeta.id)

      const store = createHydratedStore()
      await settleInitialCloudCheck()

      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json({
          projects: [
            makeUserProjectSummary({
              projectId: "project_123",
              claimedAt: "2026-05-20T00:00:00.000Z",
              createdAt: "2026-05-19T00:00:00.000Z",
            }),
          ],
        }),
      )

      await store.getState().refreshAccountProjectsFromCloud()

      const project = store.getState().projects.find((p) => p.cloudProjectId === "project_123")
      expect(project?.claimedAt).toBe("2026-05-20T00:00:00.000Z")
      expect(project?.createdAt).toBe("2026-05-19T00:00:00.000Z")
    })
  })

  describe("maybeAutoClaimActiveProject", () => {
    it("auto-claims the active anonymous project by syncing and claiming its restore key", async () => {
      const timer = makeTimer({ id: "timer-a" })
      const store = createHydratedStore({ timers: [timer] })
      await settleInitialCloudCheck()
      const activeProjectId = store.getState().activeProjectId ?? ""
      const claimedSnapshot = makeProjectSnapshot({ name: "Claimed", timers: [timer], updatedAt: FIXED_NOW })

      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(
          Response.json({
            project: {
              projectId: "project_123",
              project: claimedSnapshot,
              owner: { id: "user_123", email: "ada@example.com" },
              claimedAt: "2026-06-05T08:00:00.000Z",
            },
          }),
        )

      const maybeAutoClaim = getMaybeAutoClaimAction(store)
      await expect(maybeAutoClaim()).resolves.toBe("claimed")

      expect(store.getState().projects.find((project) => project.id === activeProjectId)).toEqual(
        expect.objectContaining({
          cloudProjectId: "project_123",
          ownerId: "user_123",
        }),
      )
    })

    it("skips auto-claim when the claim prompt was dismissed for this tab", async () => {
      const store = createHydratedStore({ timers: [makeTimer({ id: "timer-a" })] })
      await settleInitialCloudCheck()
      dismissProjectClaim(store.getState().activeProjectId ?? "")

      const maybeAutoClaim = getMaybeAutoClaimAction(store)
      await maybeAutoClaim()

      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
      expect(store.getState().projects[0].cloudProjectId).toBeUndefined()
    })

    it("attempts auto-claim even when account projects already fill the project limit", async () => {
      const timer = makeTimer({ id: "timer-a" })
      const store = createHydratedStore({ timers: [timer] })
      await settleInitialCloudCheck()
      const anonymousProject = store.getState().projects[0]
      const accountProjects = Array.from({ length: getEntitlements().maxProjects }, (_, index) =>
        makeAccountProjectMeta({
          id: `project-local-account-${index}`,
          restoreKey: `restoreKey_account${index}`,
          cloudProjectId: `project_cloud${index}`,
        }),
      )
      store.setState({ projects: [anonymousProject, ...accountProjects] })

      const claimedSnapshot = makeProjectSnapshot({ name: "Claimed", timers: [timer], updatedAt: FIXED_NOW })
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(
          Response.json({
            project: {
              projectId: "project_over_limit",
              project: claimedSnapshot,
              owner: { id: "user_123", email: "ada@example.com" },
              claimedAt: "2026-06-05T08:00:00.000Z",
              overLimit: true,
            },
          }),
        )

      const maybeAutoClaim = getMaybeAutoClaimAction(store)
      const result = await maybeAutoClaim()

      // Must have attempted the claim — fetch must have been called
      expect(vi.mocked(fetch)).toHaveBeenCalled()
      // Result is claimed_read_only because overLimit:true in response
      expect(result).toBe("claimed_read_only")
    })

    it("skips auto-claim when the active project has no timers", async () => {
      const store = createHydratedStore()
      store.getState().createProject("Empty")
      await settleInitialCloudCheck()

      const maybeAutoClaim = getMaybeAutoClaimAction(store)
      await maybeAutoClaim()

      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
      expect(store.getState().projects[0].cloudProjectId).toBeUndefined()
    })

    it("attempts auto-claim once per project even when the first attempt fails", async () => {
      const store = createHydratedStore({ timers: [makeTimer({ id: "timer-a" })] })
      await settleInitialCloudCheck()
      const maybeAutoClaim = getMaybeAutoClaimAction(store)

      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(new Response("Not found.", { status: 404 }))
      await maybeAutoClaim()
      expect(store.getState().projects[0].cloudProjectId).toBeUndefined()

      vi.mocked(fetch).mockClear()
      await maybeAutoClaim()

      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
      expect(store.getState().projects[0].cloudProjectId).toBeUndefined()
    })

    it("resolves claimed_read_only when the claim response body carries overLimit:true", async () => {
      const timer = makeTimer({ id: "timer-a" })
      const store = createHydratedStore({ timers: [timer] })
      await settleInitialCloudCheck()
      const claimedSnapshot = makeProjectSnapshot({ name: "Claimed", timers: [timer], updatedAt: FIXED_NOW })

      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(
          Response.json({
            project: {
              projectId: "project_123",
              project: claimedSnapshot,
              owner: { id: "user_123", email: "ada@example.com" },
              claimedAt: "2026-06-05T08:00:00.000Z",
              overLimit: true,
            },
          }),
        )

      // Stub the refreshAccountProjectsFromCloud that fires after claim
      vi.mocked(fetch).mockResolvedValueOnce(Response.json({ projects: [] }))

      const result = await store.getState().claimActiveProject()
      expect(result).toBe("claimed_read_only")
    })

    it("leaves state untouched when sign-out happens during an auto-claim", async () => {
      const timer = makeTimer({ id: "timer-a" })
      const store = createHydratedStore({ timers: [timer] })
      await settleInitialCloudCheck()
      const activeProjectId = store.getState().activeProjectId ?? ""
      const maybeAutoClaim = getMaybeAutoClaimAction(store)

      const resolveSave = pendingFetchOnce()
      // If the claim request still fires despite the sign-out, it succeeds —
      // the store must discard the result either way.
      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json({
          project: {
            projectId: "project_123",
            project: makeProjectSnapshot({ timers: [timer], updatedAt: FIXED_NOW }),
            owner: { id: "user_123", email: "ada@example.com" },
            claimedAt: "2026-06-05T08:00:00.000Z",
          },
        }),
      )
      const claimPromise = maybeAutoClaim()

      store.getState().removeAccountProjectsFromDevice()

      resolveSave(new Response(null, { status: 200 }))
      await claimPromise

      const project = store.getState().projects.find((item) => item.id === activeProjectId)
      expect(project?.cloudProjectId).toBeUndefined()
      expect(project?.ownerId).toBeUndefined()
      expect(project?.claimedAt).toBeUndefined()
    })
  })
})

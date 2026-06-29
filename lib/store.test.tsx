import { beforeEach, describe, expect, it, vi } from "vitest"

import { createTimerStore, type TimerStoreInit } from "@/lib/store"
import {
  TD_ACTIVE_PROJECT_STORAGE_KEY,
  TD_PROJECTS_STORAGE_KEY,
  readProjectPayload,
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

describe("timer store", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW))
    mockNotFoundFetch()
  })

  it("hydrates an empty browser without creating a default project", () => {
    const store = createHydratedStore()
    const state = store.getState()

    expect(state.hasHydrated).toBe(true)
    expect(state.projects).toEqual([])
    expect(state.activeProjectId).toBeNull()
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
    expect(readProjectPayload(state.projects[0].id)?.timers).toEqual([expect.objectContaining({ notify: true })])
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
    expect(readProjectPayload(state.projects[0].id)?.timers).toHaveLength(2)
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

  it("falls back from stale account project ids to restore-key access when refresh returns 404", async () => {
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

    const project = store.getState().projects[0]
    expect(project.cloudProjectId).toBeUndefined()
    expect(project.ownerId).toBeUndefined()
    expect(project.claimedAt).toBeUndefined()
    expect(store.getState().lastSyncError).toBeNull()
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
})

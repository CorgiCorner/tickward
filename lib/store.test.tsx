import { beforeEach, describe, expect, it, vi } from "vitest"

import { createTimerStore, type TimerStoreInit } from "@/lib/store"
import { dismissProjectClaim } from "@/lib/project-claim-dismissal.client"
import { getEntitlements } from "@/lib/entitlements"
import { projectCloudClient } from "@/lib/project-client"
import type { ProjectMeta, UserProjectSummary } from "@/lib/project-model"
import {
  TD_ACTIVE_PROJECT_STORAGE_KEY,
  TD_PROJECTS_STORAGE_KEY,
  readProjectPayload,
  writeProjectPayload,
} from "@/lib/project-storage.client"
import {
  getCountUpOccurrenceKey,
  readCountUpState,
  writeCountUpState,
  type CountUpOccurrence,
} from "@/lib/stores/count-up-store"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { FIXED_NOW, makeProjectSnapshot, makeSpace, makeTimer } from "@/test/factories"

const analyticsTrack = vi.hoisted(() => vi.fn())

vi.mock("@/components/plausible-analytics", () => ({ trackCountUpAnalyticsEvent: analyticsTrack }))

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
    analyticsTrack.mockReset()
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

  describe("project ordering", () => {
    it("moves a project and persists the new order", () => {
      const projects = [
        makeLocalProjectMeta({ id: "project-a", name: "A" }),
        makeLocalProjectMeta({ id: "project-b", name: "B" }),
        makeLocalProjectMeta({ id: "project-c", name: "C" }),
      ]
      const store = createHydratedStore()
      store.setState({ projects })

      store.getState().reorderProjects(2, 0)

      expect(store.getState().projects.map((project) => project.id)).toEqual(["project-c", "project-a", "project-b"])
      expect(
        (JSON.parse(localStorage.getItem(TD_PROJECTS_STORAGE_KEY) ?? "[]") as ProjectMeta[]).map(
          (project) => project.id,
        ),
      ).toEqual(["project-c", "project-a", "project-b"])
    })

    it("persists cloud project ids in their new order", () => {
      const reorderUserProjects = vi
        .spyOn(projectCloudClient, "reorderUserProjects")
        .mockResolvedValue({ status: "ok" })
      const projects = [
        makeAccountProjectMeta({ id: "project-a", cloudProjectId: "project_cloud_a" }),
        makeLocalProjectMeta({ id: "project-local" }),
        makeAccountProjectMeta({ id: "project-b", cloudProjectId: "project_cloud_b" }),
      ]
      const store = createHydratedStore()
      store.setState({ projects })

      store.getState().reorderProjects(2, 0)

      expect(reorderUserProjects).toHaveBeenCalledWith(["project_cloud_b", "project_cloud_a"])
    })

    it("does not call the cloud client when reordering only local projects", () => {
      const reorderUserProjects = vi
        .spyOn(projectCloudClient, "reorderUserProjects")
        .mockResolvedValue({ status: "ok" })
      const projects = [
        makeLocalProjectMeta({ id: "project-a", name: "A" }),
        makeLocalProjectMeta({ id: "project-b", name: "B" }),
      ]
      const store = createHydratedStore()
      store.setState({ projects })

      store.getState().reorderProjects(1, 0)

      expect(reorderUserProjects).not.toHaveBeenCalled()
    })

    it.each([
      [-1, 0],
      [0, -1],
      [2, 0],
      [0, 2],
    ])("ignores out-of-bounds indexes %i -> %i", (fromIndex, toIndex) => {
      const reorderUserProjects = vi
        .spyOn(projectCloudClient, "reorderUserProjects")
        .mockResolvedValue({ status: "ok" })
      const projects = [
        makeAccountProjectMeta({ id: "project-a", cloudProjectId: "project_cloud_a" }),
        makeAccountProjectMeta({ id: "project-b", cloudProjectId: "project_cloud_b" }),
      ]
      const store = createHydratedStore()
      store.setState({ projects })
      localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify(projects))

      store.getState().reorderProjects(fromIndex, toIndex)

      expect(store.getState().projects).toEqual(projects)
      expect(reorderUserProjects).not.toHaveBeenCalled()
      expect(JSON.parse(localStorage.getItem(TD_PROJECTS_STORAGE_KEY) ?? "[]")).toEqual(projects)
    })
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

describe("attention policy initialization", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW))
    analyticsTrack.mockReset()
  })

  it("snapshots the server-provided policy before browser preference effects run", () => {
    const targetAtMs = Date.parse("2026-06-05T07:00:00.000Z")
    localStorage.setItem("tickward:attention-policy:v1", JSON.stringify({ mode: "until-i-move-it", minutes: null }))
    const store = createTimerStore({
      timers: [
        makeTimer({
          targetDate: new Date(targetAtMs).toISOString(),
          createdAt: new Date(targetAtMs - 60_000).toISOString(),
        }),
      ],
      countUpPolicy: { mode: "after-seen-15m", minutes: null },
    })

    store.getState().reconcileCountUpOccurrences(targetAtMs + 1)

    expect(store.getState().countUpOccurrences[0]?.policy).toEqual({ mode: "after-seen-15m", minutes: null })
  })

  it("reports whether zero-cross detection produced an active occurrence", () => {
    const targetAtMs = Date.parse("2026-06-05T07:00:00.000Z")
    const timer = makeTimer({
      targetDate: new Date(targetAtMs).toISOString(),
      createdAt: new Date(targetAtMs - 60_000).toISOString(),
    })
    const directStore = createTimerStore({
      timers: [timer],
      countUpPolicy: { mode: "move-directly-to-past", minutes: null },
    })
    const countUpStore = createTimerStore({
      timers: [timer],
      countUpPolicy: { mode: "until-i-move-it", minutes: null },
    })

    analyticsTrack.mockClear()
    expect(directStore.getState().detectTimerZeroCross(timer.id, targetAtMs + 1)).toBe(false)
    expect(countUpStore.getState().detectTimerZeroCross(timer.id, targetAtMs + 1)).toBe(true)
    expect(countUpStore.getState().detectTimerZeroCross(timer.id, targetAtMs + 2)).toBe(true)
    expect(analyticsTrack).toHaveBeenCalledTimes(1)
    expect(analyticsTrack).toHaveBeenCalledWith("timer_crossed_zero", {
      policy: "until-i-move-it",
      secondsFromCrossedAtToFirstSeen: undefined,
      sectionSize: 1,
    })
  })

  it("auto-acknowledges a seen occurrence when its policy timer elapses", () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const timer = makeTimer({
      targetDate: new Date(targetAtMs).toISOString(),
      createdAt: new Date(targetAtMs - 60_000).toISOString(),
    })
    const key = `${timer.id}|${targetAtMs}`
    const store = createTimerStore({
      timers: [timer],
      countUpOccurrences: [
        {
          key,
          timerId: timer.id,
          targetAtMs,
          crossedAt: targetAtMs,
          firstSeenAt: null,
          reviewExpiresAt: null,
          acknowledgedAt: null,
          deferredUntil: null,
          policy: { mode: "after-seen-5m", minutes: null },
          usesDefaultPolicy: true,
        },
      ],
    })

    store.getState().markCountUpSeen([key], nowMs)
    store.getState().markCountUpSeen([key], nowMs + 1_000)
    expect(analyticsTrack).toHaveBeenCalledTimes(1)
    expect(analyticsTrack).toHaveBeenCalledWith("transition_first_seen", {
      policy: "after-seen-5m",
      secondsFromCrossedAtToFirstSeen: 60,
      sectionSize: 1,
    })
    vi.advanceTimersByTime(5 * 60_000 + 2)

    expect(store.getState().countUpOccurrences[0]?.acknowledgedAt).toBe(nowMs + 5 * 60_000 + 1)
    expect(analyticsTrack).toHaveBeenLastCalledWith("transition_auto_expired", {
      policy: "after-seen-5m",
      secondsFromCrossedAtToFirstSeen: 60,
      sectionSize: 0,
    })
  })

  it("re-arms only active seen default-policy occurrences when the effective policy changes", () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const timers = ["active", "unseen", "deferred", "override"].map((id) =>
      makeTimer({
        id,
        targetDate: new Date(targetAtMs).toISOString(),
        createdAt: new Date(targetAtMs - 60_000).toISOString(),
      }),
    )
    const occurrence = (timerId: string, overrides: Partial<CountUpOccurrence> = {}): CountUpOccurrence => ({
      key: `${timerId}|${targetAtMs}`,
      timerId,
      targetAtMs,
      crossedAt: targetAtMs,
      firstSeenAt: nowMs - 30_000,
      reviewExpiresAt: nowMs + 15 * 60_000,
      acknowledgedAt: null,
      deferredUntil: null,
      policy: { mode: "after-seen-15m", minutes: null },
      usesDefaultPolicy: true,
      ...overrides,
    })
    const store = createTimerStore({
      timers,
      countUpPolicy: { mode: "after-seen-15m", minutes: null },
      countUpOccurrences: [
        occurrence("active"),
        occurrence("unseen", { firstSeenAt: null, reviewExpiresAt: null }),
        occurrence("deferred", { deferredUntil: nowMs + 60 * 60_000 }),
        occurrence("override", {
          usesDefaultPolicy: false,
          policy: { mode: "after-seen-1d", minutes: null },
          reviewExpiresAt: nowMs + 24 * 60 * 60_000,
        }),
      ],
    })

    store.getState().setCountUpPolicy({ mode: "after-seen-5m", minutes: null })

    const byTimer = new Map(store.getState().countUpOccurrences.map((item) => [item.timerId, item]))
    expect(byTimer.get("active")?.reviewExpiresAt).toBe(nowMs + 5 * 60_000)
    expect(byTimer.get("unseen")?.reviewExpiresAt).toBeNull()
    expect(byTimer.get("deferred")?.reviewExpiresAt).toBe(nowMs + 15 * 60_000)
    expect(byTimer.get("override")?.reviewExpiresAt).toBe(nowMs + 24 * 60 * 60_000)

    vi.setSystemTime(new Date(nowMs + 60_000))
    store.getState().setCountUpPolicy({ mode: "after-seen-5m", minutes: null })
    expect(store.getState().countUpOccurrences.find((item) => item.timerId === "active")?.reviewExpiresAt).toBe(
      nowMs + 5 * 60_000,
    )
  })

  it("gives an unacknowledged custom-policy occurrence a fresh full countdown", () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const timer = makeTimer({ targetDate: new Date(targetAtMs).toISOString() })
    const key = `${timer.id}|${targetAtMs}`
    const store = createTimerStore({
      timers: [timer],
      countUpOccurrences: [
        {
          key,
          timerId: timer.id,
          targetAtMs,
          crossedAt: targetAtMs,
          firstSeenAt: null,
          reviewExpiresAt: nowMs - 30_000,
          acknowledgedAt: nowMs - 30_000,
          deferredUntil: nowMs + 60_000,
          policy: { mode: "custom", minutes: 2 },
          usesDefaultPolicy: true,
        },
      ],
    })

    store.getState().unacknowledgeCountUps([key], nowMs)

    expect(store.getState().countUpOccurrences[0]).toMatchObject({
      firstSeenAt: nowMs,
      acknowledgedAt: null,
      deferredUntil: null,
      reviewExpiresAt: nowMs + 2 * 60_000,
    })
  })
})

describe("global count-up persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW))
    mockNotFoundFetch()
    analyticsTrack.mockReset()
  })

  function countUpOccurrence(projectId: string, timerId: string, targetAtMs: number): CountUpOccurrence {
    return {
      key: getCountUpOccurrenceKey(timerId, targetAtMs),
      projectId,
      timerId,
      targetAtMs,
      crossedAt: targetAtMs,
      firstSeenAt: null,
      reviewExpiresAt: null,
      acknowledgedAt: null,
      deferredUntil: null,
      policy: { mode: "until-i-move-it", minutes: null },
      usesDefaultPolicy: true,
    }
  }

  function countUpResponse(events: CountUpOccurrence[]) {
    return new Response(
      JSON.stringify({
        events: events.map((event) => ({
          ...event,
          targetAtMs: String(event.targetAtMs),
          crossedAt: new Date(event.crossedAt).toISOString(),
          firstSeenAt: event.firstSeenAt === null ? null : new Date(event.firstSeenAt).toISOString(),
          reviewExpiresAt: event.reviewExpiresAt === null ? null : new Date(event.reviewExpiresAt).toISOString(),
          acknowledgedAt: event.acknowledgedAt === null ? null : new Date(event.acknowledgedAt).toISOString(),
          deferredUntil: event.deferredUntil === null ? null : new Date(event.deferredUntil).toISOString(),
        })),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }

  async function settleCountUpTasks() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve()
  }

  function seedProjects(
    projects: ProjectMeta[],
    activeProjectId: string,
    timersByProject: Map<string, ReturnType<typeof makeTimer>[]>,
  ) {
    localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify(projects))
    localStorage.setItem(TD_ACTIVE_PROJECT_STORAGE_KEY, activeProjectId)
    for (const project of projects) {
      writeProjectPayload(project.id, {
        timers: timersByProject.get(project.id) ?? [],
        spaces: [],
        activeSpaceId: null,
        sortMode: "soonest",
        timerFilters: { type: "all", pinned: false, muted: false, shared: false, recurring: false },
        updatedAt: project.updatedAt,
      })
    }
  }

  it("discovers inactive offline crossings across all local projects", () => {
    const nowMs = Date.parse(FIXED_NOW)
    const first = makeLocalProjectMeta({ id: "project-a", name: "Alpha", restoreKey: "restoreKey_alpha" })
    const second = makeLocalProjectMeta({ id: "project-b", name: "Beta", restoreKey: "restoreKey_beta" })
    const inactiveTimer = makeTimer({
      id: "timer-inactive",
      targetDate: new Date(nowMs - 60_000).toISOString(),
      createdAt: new Date(nowMs - 120_000).toISOString(),
    })
    seedProjects(
      [first, second],
      first.id,
      new Map([
        [first.id, [makeTimer({ id: "timer-future", targetDate: new Date(nowMs + 60_000).toISOString() })]],
        [second.id, [inactiveTimer]],
      ]),
    )

    const store = createHydratedStore()

    expect(store.getState().countUpOccurrences).toEqual([
      expect.objectContaining({ projectId: second.id, projectName: "Beta", timerId: inactiveTimer.id }),
    ])
    expect(store.getState().timers.map((timer) => timer.id)).toEqual(["timer-future"])
  })

  it("removes stale inactive-project occurrences during all-project hydration", () => {
    const nowMs = Date.parse(FIXED_NOW)
    const first = makeLocalProjectMeta({ id: "project-a", name: "Alpha", restoreKey: "restoreKey_alpha" })
    const second = makeLocalProjectMeta({ id: "project-b", name: "Beta", restoreKey: "restoreKey_beta" })
    const stale = countUpOccurrence(second.id, "timer-deleted", nowMs - 60_000)
    seedProjects([first, second], first.id, new Map())
    writeCountUpState(second.id, { occurrences: [stale], observations: [] })

    const store = createHydratedStore()

    expect(store.getState().countUpOccurrences).toEqual([])
    expect(readCountUpState(second.id).occurrences).toEqual([])
  })

  it("isolates duplicate occurrence keys and inactive-project actions by project", () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const first = makeLocalProjectMeta({ id: "project-a", name: "Alpha", restoreKey: "restoreKey_alpha" })
    const second = makeLocalProjectMeta({ id: "project-b", name: "Beta", restoreKey: "restoreKey_beta" })
    const duplicateTimer = makeTimer({
      id: "timer-duplicate",
      targetDate: new Date(targetAtMs).toISOString(),
      createdAt: new Date(targetAtMs - 60_000).toISOString(),
    })
    seedProjects(
      [first, second],
      first.id,
      new Map([
        [first.id, [duplicateTimer]],
        [second.id, [duplicateTimer]],
      ]),
    )
    const key = getCountUpOccurrenceKey(duplicateTimer.id, targetAtMs)
    writeCountUpState(first.id, {
      occurrences: [countUpOccurrence(first.id, duplicateTimer.id, targetAtMs)],
      observations: [],
    })
    writeCountUpState(second.id, {
      occurrences: [countUpOccurrence(second.id, duplicateTimer.id, targetAtMs)],
      observations: [],
    })
    const store = createHydratedStore()

    expect(store.getState().countUpOccurrences).toHaveLength(2)
    store.getState().acknowledgeCountUps([key], nowMs)
    expect(store.getState().countUpOccurrences.find((event) => event.projectId === first.id)).toMatchObject({
      firstSeenAt: null,
      acknowledgedAt: nowMs,
    })
    expect(
      store.getState().countUpOccurrences.find((event) => event.projectId === second.id)?.acknowledgedAt,
    ).toBeNull()

    store.getState().deferCountUpsForProject(second.id, [key], nowMs + 60_000)
    expect(store.getState().countUpOccurrences.find((event) => event.projectId === second.id)).toMatchObject({
      firstSeenAt: null,
      deferredUntil: nowMs + 60_000,
      acknowledgedAt: null,
    })
    store.getState().markCountUpSeenForProject(second.id, [key], nowMs + 1)
    expect(store.getState().countUpOccurrences.find((event) => event.projectId === second.id)?.firstSeenAt).toBe(
      nowMs + 1,
    )
    expect(readCountUpState(second.id).occurrences[0]).toMatchObject({ deferredUntil: nowMs + 60_000 })
  })

  it("pins and acknowledges an inactive-project occurrence only after the timer is available", async () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const first = makeLocalProjectMeta({ id: "project-a", name: "Alpha", restoreKey: "restoreKey_alpha" })
    const second = makeLocalProjectMeta({ id: "project-b", name: "Beta", restoreKey: "restoreKey_beta" })
    const timer = makeTimer({
      id: "timer-inactive",
      pinned: false,
      targetDate: new Date(targetAtMs).toISOString(),
      createdAt: new Date(targetAtMs - 60_000).toISOString(),
    })
    seedProjects([first, second], first.id, new Map([[second.id, [timer]]]))
    const occurrence = countUpOccurrence(second.id, timer.id, targetAtMs)
    writeCountUpState(second.id, { occurrences: [occurrence], observations: [] })
    const store = createHydratedStore()

    await expect(store.getState().pinCountUpForProject(second.id, timer.id, occurrence.key, nowMs)).resolves.toBe(true)

    expect(store.getState().activeProjectId).toBe(second.id)
    expect(store.getState().timers.find((candidate) => candidate.id === timer.id)?.pinned).toBe(true)
    expect(store.getState().countUpOccurrences.find((candidate) => candidate.projectId === second.id)).toMatchObject({
      acknowledgedAt: nowMs,
    })
    expect(readCountUpState(second.id).occurrences[0]).toMatchObject({ acknowledgedAt: nowMs })
  })

  it("separates cloud memory from anonymous storage and restores local identity on sign-out", async () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const local = makeLocalProjectMeta({ id: "project-local", name: "Local", restoreKey: "restoreKey_local" })
    const account = makeAccountProjectMeta()
    const timer = makeTimer({
      id: "timer-local",
      targetDate: new Date(targetAtMs).toISOString(),
      createdAt: new Date(targetAtMs - 60_000).toISOString(),
    })
    seedProjects([account, local], local.id, new Map([[local.id, [timer]]]))
    const localOccurrence = countUpOccurrence(local.id, timer.id, targetAtMs)
    writeCountUpState(local.id, { occurrences: [localOccurrence], observations: [] })
    const store = createHydratedStore()
    await settleInitialCloudCheck()
    const remoteEvent = {
      ...countUpOccurrence(account.cloudProjectId!, "timer-cloud", targetAtMs),
      projectName: "Account project",
      timer: { label: "Cloud launch", pinned: true },
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          events: [
            {
              ...remoteEvent,
              targetAtMs: String(targetAtMs),
              crossedAt: new Date(targetAtMs).toISOString(),
              firstSeenAt: null,
              acknowledgedAt: null,
              deferredUntil: null,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    await store.getState().syncCountUpOccurrences()
    expect(store.getState().countUpOccurrences.map((event) => event.projectId)).toEqual(
      expect.arrayContaining([account.cloudProjectId, local.id]),
    )
    expect(
      store.getState().countUpOccurrences.find((event) => event.projectId === account.cloudProjectId)?.timer,
    ).toEqual({ label: "Cloud launch", pinned: true })
    store.getState().acknowledgeCountUpsForProject(local.id, [localOccurrence.key], nowMs)
    expect(readCountUpState(local.id).occurrences[0]?.acknowledgedAt).toBeNull()

    store.getState().removeAccountProjectsFromDevice()
    expect(store.getState().countUpOccurrences).toEqual([
      expect.objectContaining({ projectId: local.id, acknowledgedAt: null }),
    ])
  })

  it("discards late count-up GET and POST responses after sign-out", async () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const local = makeLocalProjectMeta({ id: "project-local", name: "Local", restoreKey: "restoreKey_local" })
    const account = makeAccountProjectMeta()
    const timer = makeTimer({
      id: "timer-local",
      targetDate: new Date(targetAtMs).toISOString(),
      createdAt: new Date(targetAtMs - 60_000).toISOString(),
    })
    seedProjects([account, local], local.id, new Map([[local.id, [timer]]]))
    const localOccurrence = countUpOccurrence(local.id, timer.id, targetAtMs)
    writeCountUpState(local.id, { occurrences: [localOccurrence], observations: [] })

    const staleGetStore = createHydratedStore()
    await settleInitialCloudCheck()
    const resolveGet = pendingFetchOnce()
    const sync = staleGetStore.getState().syncCountUpOccurrences()
    staleGetStore.getState().removeAccountProjectsFromDevice()
    resolveGet(countUpResponse([countUpOccurrence(account.cloudProjectId!, "timer-cloud-get", targetAtMs)]))
    await sync

    expect(staleGetStore.getState().countUpOccurrences).toEqual([
      expect.objectContaining({ projectId: local.id, timerId: timer.id }),
    ])

    seedProjects([account, local], local.id, new Map([[local.id, [timer]]]))
    writeCountUpState(local.id, { occurrences: [localOccurrence], observations: [] })
    const stalePostStore = createHydratedStore()
    await settleInitialCloudCheck()
    const cloudEvent = countUpOccurrence(account.cloudProjectId!, "timer-cloud-post", targetAtMs)
    vi.mocked(fetch).mockResolvedValueOnce(countUpResponse([cloudEvent]))
    await stalePostStore.getState().syncCountUpOccurrences()

    const resolvePost = pendingFetchOnce()
    stalePostStore.getState().acknowledgeCountUpsForProject(account.cloudProjectId!, [cloudEvent.key], nowMs)
    await settleCountUpTasks()
    stalePostStore.getState().removeAccountProjectsFromDevice()
    resolvePost(countUpResponse([{ ...cloudEvent, acknowledgedAt: nowMs }]))
    await settleCountUpTasks()

    expect(stalePostStore.getState().countUpOccurrences).toEqual([
      expect.objectContaining({ projectId: local.id, timerId: timer.id }),
    ])
  })

  it("serializes acknowledge and Undo so the late acknowledge response cannot win", async () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const local = makeLocalProjectMeta({ id: "project-local", name: "Local", restoreKey: "restoreKey_local" })
    const account = makeAccountProjectMeta()
    seedProjects([account, local], local.id, new Map())
    const store = createHydratedStore()
    await settleInitialCloudCheck()
    const cloudEvent = countUpOccurrence(account.cloudProjectId!, "timer-cloud", targetAtMs)
    vi.mocked(fetch).mockResolvedValueOnce(countUpResponse([cloudEvent]))
    await store.getState().syncCountUpOccurrences()

    const requests: Array<{ action: string }> = []
    const responders: Array<(response: Response) => void> = []
    vi.mocked(fetch).mockImplementation((_input, init) => {
      requests.push(JSON.parse(String(init?.body)) as { action: string })
      return new Promise<Response>((resolve) => responders.push(resolve))
    })

    store.getState().acknowledgeCountUpsForProject(account.cloudProjectId!, [cloudEvent.key], nowMs)
    store.getState().unacknowledgeCountUpsForProject(account.cloudProjectId!, [cloudEvent.key])
    await settleCountUpTasks()

    expect(requests).toEqual([expect.objectContaining({ action: "acknowledge" })])
    responders[0](countUpResponse([{ ...cloudEvent, acknowledgedAt: nowMs }]))
    await vi.waitFor(() => {
      expect(requests).toEqual([
        expect.objectContaining({ action: "acknowledge" }),
        expect.objectContaining({ action: "unacknowledge" }),
      ])
    })

    responders[1](countUpResponse([cloudEvent]))
    await vi.waitFor(() => {
      expect(
        store.getState().countUpOccurrences.find((event) => event.projectId === account.cloudProjectId)?.acknowledgedAt,
      ).toBeNull()
    })
  })

  it("treats cloud mutation responses as authoritative without removing anonymous events", async () => {
    const nowMs = Date.parse(FIXED_NOW)
    const targetAtMs = nowMs - 60_000
    const local = makeLocalProjectMeta({ id: "project-local", name: "Local", restoreKey: "restoreKey_local" })
    const account = makeAccountProjectMeta()
    const localTimer = makeTimer({
      id: "timer-local",
      targetDate: new Date(targetAtMs).toISOString(),
      createdAt: new Date(targetAtMs - 60_000).toISOString(),
    })
    seedProjects([account, local], local.id, new Map([[local.id, [localTimer]]]))
    const localOccurrence = countUpOccurrence(local.id, localTimer.id, targetAtMs)
    writeCountUpState(local.id, { occurrences: [localOccurrence], observations: [] })
    const store = createHydratedStore()
    await settleInitialCloudCheck()
    const retainedCloudEvent = countUpOccurrence(account.cloudProjectId!, "timer-cloud", targetAtMs)
    const staleCloudEvent = countUpOccurrence(account.cloudProjectId!, "timer-cloud-stale", targetAtMs - 1)
    vi.mocked(fetch).mockResolvedValueOnce(countUpResponse([retainedCloudEvent, staleCloudEvent]))
    await store.getState().syncCountUpOccurrences()
    expect(store.getState().countUpOccurrences).toHaveLength(3)

    vi.mocked(fetch).mockResolvedValueOnce(countUpResponse([{ ...retainedCloudEvent, firstSeenAt: nowMs }]))
    store.getState().markCountUpSeenForProject(account.cloudProjectId!, [retainedCloudEvent.key], nowMs)
    await vi.waitFor(() => expect(store.getState().countUpOccurrences).toHaveLength(2))

    expect(store.getState().countUpOccurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId: local.id, timerId: localTimer.id }),
        expect.objectContaining({ projectId: account.cloudProjectId, timerId: retainedCloudEvent.timerId }),
      ]),
    )
    expect(store.getState().countUpOccurrences.some((event) => event.timerId === staleCloudEvent.timerId)).toBe(false)
  })
})

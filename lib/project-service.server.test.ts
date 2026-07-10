import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Actor } from "@/lib/contracts"
import { makeProjectSnapshot } from "@/test/factories"

const actor: Actor = { kind: "anonymous", restoreKey: "restoreKey_123" }

const mocks = vi.hoisted(() => ({
  projectRepository: {
    loadSnapshot: vi.fn(),
    saveSnapshot: vi.fn(),
    clear: vi.fn(),
    claimAnonymousProject: vi.fn(),
    listUserProjects: vi.fn(),
    loadUserProject: vi.fn(),
    saveUserProject: vi.fn(),
    clearUserProject: vi.fn(),
    // New optional method for read-only rule
    listProjectMemberships: vi.fn(),
  },
  getEntitlements: vi.fn(),
}))

vi.mock("@/lib/server-adapters.server", () => ({
  getServerAdapters: () => ({
    projectRepository: mocks.projectRepository,
  }),
}))

vi.mock("@/lib/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/entitlements")>()
  return {
    ...actual,
    getEntitlements: mocks.getEntitlements,
  }
})

describe("project service", () => {
  beforeEach(() => {
    mocks.projectRepository.loadSnapshot.mockReset()
    mocks.projectRepository.saveSnapshot.mockReset()
    mocks.projectRepository.saveSnapshot.mockResolvedValue(true)
    mocks.projectRepository.clear.mockReset()
    mocks.projectRepository.claimAnonymousProject = vi.fn()
    mocks.projectRepository.listUserProjects.mockReset()
    mocks.projectRepository.loadUserProject.mockReset()
    mocks.projectRepository.saveUserProject.mockReset()
    mocks.projectRepository.clearUserProject.mockReset()
    // Re-initialize after tests that remove the optional method
    mocks.projectRepository.listProjectMemberships = vi.fn().mockResolvedValue([])
    // Default entitlements: maxProjects = 2
    mocks.getEntitlements.mockReturnValue({
      maxProjects: 2,
      maxSnapshotTimers: 50,
      maxSpaces: 2,
      maxTimers: 20,
      maxTimersPerSpace: 5,
    })
  })

  it("loads projects through the repository", async () => {
    const { loadProject } = await import("./project-service.server")
    const restored = { project: makeProjectSnapshot(), source: "project" as const }
    mocks.projectRepository.loadSnapshot.mockResolvedValue(restored)

    await expect(loadProject(actor)).resolves.toBe(restored)
    expect(mocks.projectRepository.loadSnapshot).toHaveBeenCalledWith("restoreKey_123")
  })

  it("returns a conflict without writing when the cloud snapshot changed", async () => {
    const { saveProject } = await import("./project-service.server")
    const current = makeProjectSnapshot({ updatedAt: "2026-05-24T10:00:00.000Z" })
    const incoming = makeProjectSnapshot({ updatedAt: "2026-05-24T09:00:00.000Z" })
    mocks.projectRepository.loadSnapshot.mockResolvedValue({ project: current, source: "project" })

    const result = await saveProject({
      actor,
      project: incoming,
      baseUpdatedAt: "2026-05-24T08:00:00.000Z",
      force: false,
    })

    expect(result).toEqual({ status: "conflict", project: current, source: "project" })
    expect(mocks.projectRepository.saveSnapshot).not.toHaveBeenCalled()
  })

  it("returns a conflict without baseUpdatedAt and surfaces the legacy source", async () => {
    const { saveProject } = await import("./project-service.server")
    const current = makeProjectSnapshot({ updatedAt: "2026-05-24T10:00:00.000Z" })
    const incoming = makeProjectSnapshot({ updatedAt: "2026-05-24T09:00:00.000Z" })
    mocks.projectRepository.loadSnapshot.mockResolvedValue({ project: current, source: "legacy" })

    const result = await saveProject({
      actor,
      project: incoming,
      baseUpdatedAt: null,
      force: false,
    })

    expect(result).toEqual({ status: "conflict", project: current, source: "legacy" })
    expect(mocks.projectRepository.saveSnapshot).not.toHaveBeenCalled()
  })

  it("saves when baseUpdatedAt matches the cloud snapshot", async () => {
    const { saveProject } = await import("./project-service.server")
    const current = makeProjectSnapshot({ updatedAt: "2026-05-24T10:00:00.000Z" })
    const incoming = makeProjectSnapshot({ updatedAt: "2026-05-24T11:00:00.000Z" })
    mocks.projectRepository.loadSnapshot.mockResolvedValue({ project: current, source: "project" })

    const result = await saveProject({
      actor,
      project: incoming,
      baseUpdatedAt: "2026-05-24T10:00:00.000Z",
      force: false,
    })

    expect(result).toEqual({ status: "saved", project: incoming })
    expect(mocks.projectRepository.saveSnapshot).toHaveBeenCalledWith("restoreKey_123", incoming)
  })

  it("saves the snapshot through the repository", async () => {
    const { saveProject } = await import("./project-service.server")
    const project = makeProjectSnapshot()
    mocks.projectRepository.loadSnapshot.mockResolvedValue(null)
    mocks.projectRepository.saveSnapshot.mockResolvedValue(true)

    const result = await saveProject({
      actor,
      project,
      baseUpdatedAt: null,
      force: false,
    })

    expect(result).toEqual({ status: "saved", project })
    expect(mocks.projectRepository.saveSnapshot).toHaveBeenCalledWith("restoreKey_123", project)
  })

  it("returns not_found when a restore-key save is rejected by the repository", async () => {
    const { saveProject } = await import("./project-service.server")
    const project = makeProjectSnapshot()
    mocks.projectRepository.loadSnapshot.mockResolvedValue(null)
    mocks.projectRepository.saveSnapshot.mockResolvedValue(false)

    await expect(
      saveProject({
        actor,
        project,
        baseUpdatedAt: null,
        force: false,
      }),
    ).resolves.toEqual({ status: "not_found" })
  })

  it("force saves over a changed cloud snapshot", async () => {
    const { saveProject } = await import("./project-service.server")
    const project = makeProjectSnapshot({ updatedAt: "2026-05-24T09:00:00.000Z" })
    mocks.projectRepository.saveSnapshot.mockResolvedValue(true)
    mocks.projectRepository.loadSnapshot.mockResolvedValue({
      project: makeProjectSnapshot({ updatedAt: "2026-05-24T10:00:00.000Z" }),
      source: "project",
    })

    const result = await saveProject({
      actor,
      project,
      baseUpdatedAt: null,
      force: true,
    })

    expect(result).toEqual({ status: "saved", project })
    expect(mocks.projectRepository.saveSnapshot).toHaveBeenCalledWith("restoreKey_123", project)
  })

  it("clears projects through the repository", async () => {
    const { clearProject } = await import("./project-service.server")
    mocks.projectRepository.clear.mockResolvedValue(undefined)

    await clearProject(actor)
    expect(mocks.projectRepository.clear).toHaveBeenCalledWith("restoreKey_123")
  })

  it("does not claim projects for anonymous actors", async () => {
    const { claimProject } = await import("./project-service.server")

    await expect(claimProject({ actor, restoreKey: "restoreKey_123" })).resolves.toEqual({ status: "unauthenticated" })
  })

  it("reports unsupported claiming until a private repository adapter implements it", async () => {
    const { claimProject } = await import("./project-service.server")
    const userActor: Actor = { kind: "user", user: { id: "user_123" } }
    const repository = mocks.projectRepository as Partial<typeof mocks.projectRepository>
    repository.claimAnonymousProject = undefined

    await expect(claimProject({ actor: userActor, restoreKey: "restoreKey_123" })).resolves.toEqual({
      status: "unsupported",
    })
  })

  it("requires a signed-in user for user project access", async () => {
    const { listUserProjects, loadUserProject, saveUserProject, clearUserProject } = await import(
      "./project-service.server"
    )

    await expect(listUserProjects(actor)).resolves.toEqual({ status: "unauthenticated" })
    await expect(loadUserProject(actor, "project_123")).resolves.toEqual({ status: "unauthenticated" })
    await expect(
      saveUserProject(actor, "project_123", {
        project: makeProjectSnapshot(),
        baseUpdatedAt: null,
        force: false,
      }),
    ).resolves.toEqual({ status: "unauthenticated" })
    await expect(clearUserProject(actor, "project_123")).resolves.toEqual({ status: "unauthenticated" })
  })

  it("loads signed-in user projects through the repository", async () => {
    const { loadUserProject } = await import("./project-service.server")
    const userActor: Actor = { kind: "user", user: { id: "user_123" } }
    const restored = { project: makeProjectSnapshot(), source: "project" as const, projectId: "project_123" }
    mocks.projectRepository.loadUserProject.mockResolvedValue(restored)

    await expect(loadUserProject(userActor, "project_123")).resolves.toEqual({ status: "ok", data: restored })
    expect(mocks.projectRepository.loadUserProject).toHaveBeenCalledWith({
      projectId: "project_123",
      user: { id: "user_123" },
    })
  })

  it("lists signed-in user projects through the repository", async () => {
    const { listUserProjects } = await import("./project-service.server")
    const userActor: Actor = { kind: "user", user: { id: "user_123" } }
    const projects = [
      {
        projectId: "project_123",
        name: "Main",
        ownerId: "user_123",
        createdAt: "2026-06-05T20:50:40.519Z",
        updatedAt: "2026-06-05T21:11:37.795Z",
        timerCount: 16,
        spaceCount: 1,
      },
    ]
    mocks.projectRepository.listUserProjects.mockResolvedValue(projects)

    await expect(listUserProjects(userActor)).resolves.toEqual({ status: "ok", data: projects })
    expect(mocks.projectRepository.listUserProjects).toHaveBeenCalledWith({ user: { id: "user_123" } })
  })

  it("returns user project conflicts without writing", async () => {
    const { saveUserProject } = await import("./project-service.server")
    const userActor: Actor = { kind: "user", user: { id: "user_123" } }
    const current = makeProjectSnapshot({ updatedAt: "2026-05-24T10:00:00.000Z" })
    const incoming = makeProjectSnapshot({ updatedAt: "2026-05-24T09:00:00.000Z" })
    mocks.projectRepository.loadUserProject.mockResolvedValue({ project: current, source: "project" })

    await expect(
      saveUserProject(userActor, "project_123", {
        project: incoming,
        baseUpdatedAt: "2026-05-24T08:00:00.000Z",
        force: false,
      }),
    ).resolves.toEqual({
      status: "ok",
      data: { status: "conflict", project: current, source: "project" },
    })
    expect(mocks.projectRepository.saveUserProject).not.toHaveBeenCalled()
  })

  it("saves and clears signed-in user projects through the repository", async () => {
    const { saveUserProject, clearUserProject } = await import("./project-service.server")
    const userActor: Actor = { kind: "user", user: { id: "user_123" } }
    const project = makeProjectSnapshot()
    mocks.projectRepository.loadUserProject.mockResolvedValue({ project, source: "project" })
    mocks.projectRepository.saveUserProject.mockResolvedValue(true)
    mocks.projectRepository.clearUserProject.mockResolvedValue(true)

    await expect(
      saveUserProject(userActor, "project_123", {
        project,
        baseUpdatedAt: project.updatedAt,
        force: false,
      }),
    ).resolves.toEqual({ status: "ok", data: { status: "saved", project } })
    await expect(clearUserProject(userActor, "project_123")).resolves.toEqual({ status: "ok", data: true })
  })

  describe("read-only enforcement in saveUserProject", () => {
    it("returns read_only data status when owner memberships mark target project over-limit", async () => {
      const { saveUserProject } = await import("./project-service.server")
      const userActor: Actor = { kind: "user", user: { id: "user_123" } }
      const project = makeProjectSnapshot()
      mocks.projectRepository.loadUserProject.mockResolvedValue({
        project,
        source: "project",
        projectId: "project_newer",
        ownerId: "user_123",
      })
      // Simulate owner having 2 projects: older is editable, newer is over-limit (limit=1)
      mocks.getEntitlements.mockReturnValue({
        maxProjects: 1,
        maxSnapshotTimers: 50,
        maxSpaces: 2,
        maxTimers: 20,
        maxTimersPerSpace: 5,
      })
      mocks.projectRepository.listProjectMemberships.mockResolvedValue([
        { id: "project_older", claimedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "project_newer", claimedAt: "2026-06-01T00:00:00.000Z", createdAt: "2026-06-01T00:00:00.000Z" },
      ])

      const result = await saveUserProject(userActor, "project_newer", {
        project,
        baseUpdatedAt: null,
        force: false,
      })

      expect(result).toEqual({ status: "ok", data: { status: "read_only" } })
      expect(mocks.projectRepository.saveUserProject).not.toHaveBeenCalled()
    })

    it("allows save on the oldest (editable) project even when owner is over-limit", async () => {
      const { saveUserProject } = await import("./project-service.server")
      const userActor: Actor = { kind: "user", user: { id: "user_123" } }
      const project = makeProjectSnapshot()
      mocks.projectRepository.loadUserProject.mockResolvedValue({
        project,
        source: "project",
        projectId: "project_older",
        ownerId: "user_123",
      })
      mocks.getEntitlements.mockReturnValue({
        maxProjects: 1,
        maxSnapshotTimers: 50,
        maxSpaces: 2,
        maxTimers: 20,
        maxTimersPerSpace: 5,
      })
      mocks.projectRepository.listProjectMemberships.mockResolvedValue([
        { id: "project_older", claimedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "project_newer", claimedAt: "2026-06-01T00:00:00.000Z", createdAt: "2026-06-01T00:00:00.000Z" },
      ])
      mocks.projectRepository.saveUserProject.mockResolvedValue(true)

      const result = await saveUserProject(userActor, "project_older", {
        project,
        baseUpdatedAt: project.updatedAt,
        force: false,
      })

      expect(result).toEqual({ status: "ok", data: { status: "saved", project } })
    })

    it("fails open (proceeds with save) when repository lacks listProjectMemberships", async () => {
      const { saveUserProject } = await import("./project-service.server")
      const userActor: Actor = { kind: "user", user: { id: "user_123" } }
      const project = makeProjectSnapshot()
      mocks.projectRepository.loadUserProject.mockResolvedValue({
        project,
        source: "project",
        projectId: "project_123",
        ownerId: "user_123",
      })
      mocks.projectRepository.saveUserProject.mockResolvedValue(true)
      // Remove the optional method from the repo
      const repoWithoutMemberships = mocks.projectRepository as Partial<typeof mocks.projectRepository>
      repoWithoutMemberships.listProjectMemberships = undefined

      const result = await saveUserProject(userActor, "project_123", {
        project,
        baseUpdatedAt: project.updatedAt,
        force: false,
      })

      expect(result).toEqual({ status: "ok", data: { status: "saved", project } })
    })
  })

  describe("claimProject over-limit", () => {
    it("returns overLimit:true in result when account has more projects than the limit after claim", async () => {
      const { claimProject } = await import("./project-service.server")
      const userActor: Actor = { kind: "user", user: { id: "user_123" } }
      const claimedProject = {
        projectId: "project_new",
        project: makeProjectSnapshot(),
        owner: { id: "user_123", email: "ada@example.com" },
        claimedAt: "2026-06-05T08:00:00.000Z",
      }
      mocks.projectRepository.claimAnonymousProject = vi.fn().mockResolvedValue(claimedProject)
      mocks.getEntitlements.mockReturnValue({
        maxProjects: 1,
        maxSnapshotTimers: 50,
        maxSpaces: 2,
        maxTimers: 20,
        maxTimersPerSpace: 5,
      })
      // After claim, owner has 2 memberships but limit is 1 → new one is read-only
      mocks.projectRepository.listProjectMemberships.mockResolvedValue([
        { id: "project_existing", claimedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "project_new", claimedAt: "2026-06-05T08:00:00.000Z", createdAt: "2026-06-05T08:00:00.000Z" },
      ])

      const result = await claimProject({ actor: userActor, restoreKey: "restoreKey_123" })

      expect(result.status).toBe("claimed")
      // The result must carry overLimit: true so the client knows to show the read-only toast
      expect((result as { status: "claimed"; project: unknown; overLimit?: boolean }).overLimit).toBe(true)
    })

    it("never refuses a claim based on count — always attempts even at the limit", async () => {
      const { claimProject } = await import("./project-service.server")
      const userActor: Actor = { kind: "user", user: { id: "user_123" } }
      const claimedProject = {
        projectId: "project_new",
        project: makeProjectSnapshot(),
        owner: { id: "user_123", email: "ada@example.com" },
        claimedAt: "2026-06-05T08:00:00.000Z",
      }
      mocks.projectRepository.claimAnonymousProject = vi.fn().mockResolvedValue(claimedProject)
      mocks.getEntitlements.mockReturnValue({
        maxProjects: 1,
        maxSnapshotTimers: 50,
        maxSpaces: 2,
        maxTimers: 20,
        maxTimersPerSpace: 5,
      })
      mocks.projectRepository.listProjectMemberships.mockResolvedValue([
        { id: "project_existing", claimedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "project_new", claimedAt: "2026-06-05T08:00:00.000Z", createdAt: "2026-06-05T08:00:00.000Z" },
      ])

      const result = await claimProject({ actor: userActor, restoreKey: "restoreKey_123" })

      // Must have actually called claimAnonymousProject, not short-circuited
      expect(mocks.projectRepository.claimAnonymousProject).toHaveBeenCalled()
      expect(result.status).toBe("claimed")
    })
  })
})

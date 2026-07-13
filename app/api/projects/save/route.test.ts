import { beforeEach, describe, expect, it, vi } from "vitest"

import { ServerPersistenceUnavailableError } from "@/lib/db/prisma.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { makeProjectSnapshot, jsonRequest } from "@/test/factories"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  getEntitlementsForActor: vi.fn(),
  saveProject: vi.fn(),
  saveUserProject: vi.fn(),
  enforceRateLimit: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/entitlements.server", () => ({
  getEntitlementsForActor: mocks.getEntitlementsForActor,
}))

vi.mock("@/lib/project-service.server", () => ({
  saveProject: mocks.saveProject,
  saveUserProject: mocks.saveUserProject,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}))

const actor = { kind: "anonymous" as const, restoreKey: "restoreKey_123" }
const userActor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }

describe("POST /api/projects/save", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.getEntitlementsForActor.mockReset()
    mocks.saveProject.mockReset()
    mocks.saveUserProject.mockReset()
    mocks.enforceRateLimit.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.getEntitlementsForActor.mockImplementation(async (currentActor: typeof actor | typeof userActor) => ({
      plan: currentActor.kind === "user" ? "free" : "anonymous",
      maxProjects: currentActor.kind === "user" ? 4 : 2,
      maxSnapshotTimers: 50,
      maxSpaces: currentActor.kind === "user" ? 4 : 2,
      maxTimers: currentActor.kind === "user" ? 40 : 20,
      maxTimersPerSpace: currentActor.kind === "user" ? 40 : 20,
    }))
    mocks.enforceRateLimit.mockResolvedValue(null)
  })

  it("rejects invalid JSON", async () => {
    const { POST } = await import("./route")
    const res = await POST(
      new Request("https://tickward.test/api/projects/save", {
        method: "POST",
        body: "{bad",
      }),
    )

    expect(res.status).toBe(400)
    await expectPublicError(res, PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson")
  })

  it("rejects invalid restore keys and invalid snapshots", async () => {
    const { POST } = await import("./route")

    expect(
      (
        await POST(
          jsonRequest("https://tickward.test/api/projects/save", {
            key: "bad",
            project: makeProjectSnapshot(),
          }),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await POST(
          jsonRequest("https://tickward.test/api/projects/save", {
            projectId: "bad",
            project: makeProjectSnapshot(),
          }),
        )
      ).status,
    ).toBe(400)

    const invalidSnapshot = { ...makeProjectSnapshot(), timers: [{ id: "timer-a" }] }
    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project: invalidSnapshot,
      }),
    )

    expect(res.status).toBe(400)
    await expectPublicError(res, PUBLIC_ERROR_CODES.invalidProjectPayload, "errors.invalidProjectPayload")
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
    expect(mocks.saveProject).not.toHaveBeenCalled()
    expect(mocks.saveUserProject).not.toHaveBeenCalled()
  })

  it("rejects snapshots over the actor's total timer limit, including archived timers", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot({
      timers: Array.from({ length: 21 }, (_, index) => ({
        id: `timer-${index}`,
        label: `Timer ${index}`,
        targetDate: "2026-05-25T12:00:00.000Z",
        timezone: "Europe/Warsaw",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
        archivedAt: "2026-05-21T00:00:00.000Z",
      })),
    })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project,
      }),
    )

    expect(res.status).toBe(400)
    await expectPublicError(res, PUBLIC_ERROR_CODES.tooManyTimers, "errors.tooManyTimers")
    expect(mocks.saveProject).not.toHaveBeenCalled()
  })

  it("rejects snapshots over the active timer limit for one space", async () => {
    const { POST } = await import("./route")
    mocks.getEntitlementsForActor.mockResolvedValue({
      plan: "anonymous",
      maxProjects: 2,
      maxSnapshotTimers: 50,
      maxSpaces: 2,
      maxTimers: 20,
      maxTimersPerSpace: 2,
    })
    const project = makeProjectSnapshot({
      spaces: [{ id: "space-a", name: "Work", createdAt: "2026-05-20T00:00:00.000Z" }],
      timers: Array.from({ length: 3 }, (_, index) => ({
        id: `timer-${index}`,
        label: `Timer ${index}`,
        targetDate: "2026-05-25T12:00:00.000Z",
        timezone: "Europe/Warsaw",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
        spaceId: "space-a",
      })),
    })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project,
      }),
    )

    expect(res.status).toBe(400)
    await expectPublicError(res, PUBLIC_ERROR_CODES.tooManyTimersPerSpace, "errors.tooManyTimersPerSpace")
    expect(mocks.saveProject).not.toHaveBeenCalled()
  })

  it("resolves the actor before rate limiting valid project saves", async () => {
    const { POST } = await import("./route")
    mocks.enforceRateLimit.mockResolvedValue(new Response("limited", { status: 429 }))

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project: makeProjectSnapshot(),
      }),
    )

    expect(res.status).toBe(429)
    await expect(res.text()).resolves.toBe("limited")
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("write", "restoreKey_123")
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
    expect(mocks.saveProject).not.toHaveBeenCalled()
  })

  it("allows signed-in snapshots that exceed anonymous caps but fit the free plan", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot({
      spaces: Array.from({ length: 3 }, (_, index) => ({
        id: `space-${index}`,
        name: `Space ${index}`,
        createdAt: "2026-05-20T00:00:00.000Z",
      })),
      timers: Array.from({ length: 21 }, (_, index) => ({
        id: `timer-${index}`,
        label: `Timer ${index}`,
        targetDate: "2026-05-25T12:00:00.000Z",
        timezone: "Europe/Warsaw",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      })),
    })
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.saveUserProject.mockResolvedValue({ status: "ok", data: { status: "saved", project } })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        projectId: "project_123",
        project,
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.getEntitlementsForActor).toHaveBeenCalledWith(userActor)
    expect(mocks.saveUserProject).toHaveBeenCalled()
  })

  it("returns a conflict when the cloud project changed since baseUpdatedAt", async () => {
    const { POST } = await import("./route")
    const current = makeProjectSnapshot({ updatedAt: "2026-05-24T10:00:00.000Z" })
    const incoming = makeProjectSnapshot({ updatedAt: "2026-05-24T09:00:00.000Z" })
    mocks.saveProject.mockResolvedValue({ status: "conflict", project: current, source: "project" })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project: incoming,
        baseUpdatedAt: "2026-05-24T08:00:00.000Z",
      }),
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ conflict: true, project: current, source: "project" })
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
    expect(mocks.saveProject).toHaveBeenCalledWith({
      actor,
      project: incoming,
      baseUpdatedAt: "2026-05-24T08:00:00.000Z",
      force: false,
    })
  })

  it("saves v2 project snapshots", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot()
    mocks.saveProject.mockResolvedValue({ status: "saved", project })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project,
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, project })
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
    expect(mocks.saveProject).toHaveBeenCalledWith({
      actor,
      project,
      baseUpdatedAt: null,
      force: false,
    })
  })

  it("returns 404 when restore-key saves target a revoked or missing project", async () => {
    const { POST } = await import("./route")
    mocks.saveProject.mockResolvedValue({ status: "not_found" })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project: makeProjectSnapshot(),
      }),
    )

    expect(res.status).toBe(404)
    await expectPublicError(res, PUBLIC_ERROR_CODES.notFound, "errors.notFound")
  })

  it("returns a public storage error when restore-key persistence is unavailable", async () => {
    const { POST } = await import("./route")
    mocks.saveProject.mockRejectedValue(new ServerPersistenceUnavailableError())

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project: makeProjectSnapshot(),
      }),
    )

    expect(res.status).toBe(503)
    await expectPublicError(res, PUBLIC_ERROR_CODES.storageUnavailable, "errors.storageUnavailable")
  })

  it("does not mask unexpected restore-key save errors", async () => {
    const { POST } = await import("./route")
    mocks.saveProject.mockRejectedValue(new Error("write exploded"))

    await expect(
      POST(
        jsonRequest("https://tickward.test/api/projects/save", {
          key: "restoreKey_123",
          project: makeProjectSnapshot(),
        }),
      ),
    ).rejects.toThrow("write exploded")
  })

  it("returns 401 when restore-key save cannot resolve an actor", async () => {
    const { POST } = await import("./route")
    mocks.getCurrentActor.mockRejectedValue(new Error("missing actor"))

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project: makeProjectSnapshot(),
      }),
    )

    expect(res.status).toBe(401)
    await expectPublicError(res, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")
    expect(mocks.saveProject).not.toHaveBeenCalled()
  })

  it("allows force saves over changed cloud snapshots", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot({ updatedAt: "2026-05-24T09:00:00.000Z" })
    mocks.saveProject.mockResolvedValue({ status: "saved", project })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project,
        force: true,
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.saveProject).toHaveBeenCalledWith({
      actor,
      project,
      baseUpdatedAt: null,
      force: true,
    })
  })

  it("saves signed-in user projects by project id", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot()
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.saveUserProject.mockResolvedValue({ status: "ok", data: { status: "saved", project } })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        projectId: "project_123",
        project,
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, project })
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("write", "user:user_123:project:project_123")
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({ request: expect.any(Request) })
    expect(mocks.saveUserProject).toHaveBeenCalledWith(userActor, "project_123", {
      project,
      baseUpdatedAt: null,
      force: false,
    })
  })

  it("returns 401 when user project saves have no session actor", async () => {
    const { POST } = await import("./route")
    mocks.getCurrentActor.mockRejectedValue(new Error("missing session"))

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        projectId: "project_123",
        project: makeProjectSnapshot(),
      }),
    )

    expect(res.status).toBe(401)
    await expectPublicError(res, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.saveUserProject).not.toHaveBeenCalled()
  })

  it("maps user project save status responses to public errors", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot()
    mocks.getCurrentActor.mockResolvedValue(userActor)

    mocks.saveUserProject.mockResolvedValueOnce({ status: "unauthenticated" })
    const unauthenticated = await POST(
      jsonRequest("https://tickward.test/api/projects/save", { projectId: "project_123", project }),
    )
    expect(unauthenticated.status).toBe(401)
    await expectPublicError(unauthenticated, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")

    mocks.saveUserProject.mockResolvedValueOnce({ status: "unsupported" })
    const unsupported = await POST(
      jsonRequest("https://tickward.test/api/projects/save", { projectId: "project_123", project }),
    )
    expect(unsupported.status).toBe(501)
    await expectPublicError(unsupported, PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported")

    mocks.saveUserProject.mockResolvedValueOnce({ status: "not_found" })
    const notFound = await POST(
      jsonRequest("https://tickward.test/api/projects/save", { projectId: "project_123", project }),
    )
    expect(notFound.status).toBe(404)
    await expectPublicError(notFound, PUBLIC_ERROR_CODES.notFound, "errors.notFound")
  })

  it("maps nested user project save results", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot()
    const remote = makeProjectSnapshot({ updatedAt: "2026-05-25T00:00:00.000Z" })
    mocks.getCurrentActor.mockResolvedValue(userActor)

    mocks.saveUserProject.mockResolvedValueOnce({ status: "ok", data: { status: "not_found" } })
    const notFound = await POST(
      jsonRequest("https://tickward.test/api/projects/save", { projectId: "project_123", project }),
    )
    expect(notFound.status).toBe(404)
    await expectPublicError(notFound, PUBLIC_ERROR_CODES.notFound, "errors.notFound")

    mocks.saveUserProject.mockResolvedValueOnce({
      status: "ok",
      data: { status: "conflict", project: remote, source: "project" },
    })
    const conflict = await POST(
      jsonRequest("https://tickward.test/api/projects/save", { projectId: "project_123", project }),
    )
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toEqual({ conflict: true, project: remote, source: "project" })
  })

  it("returns a public storage error when user project persistence is unavailable", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot()
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.saveUserProject.mockRejectedValue(new ServerPersistenceUnavailableError())

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        projectId: "project_123",
        project,
      }),
    )

    expect(res.status).toBe(503)
    await expectPublicError(res, PUBLIC_ERROR_CODES.storageUnavailable, "errors.storageUnavailable")
  })

  it("does not mask unexpected user project save errors", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot()
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.saveUserProject.mockRejectedValue(new Error("user write exploded"))

    await expect(
      POST(
        jsonRequest("https://tickward.test/api/projects/save", {
          projectId: "project_123",
          project,
        }),
      ),
    ).rejects.toThrow("user write exploded")
  })

  it("returns 403 project_read_only when saveUserProject reports read_only", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot()
    mocks.getCurrentActor.mockResolvedValue(userActor)
    // Simulate the new read_only nested status from saveUserProject
    mocks.saveUserProject.mockResolvedValue({ status: "ok", data: { status: "read_only" } })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        projectId: "project_123",
        project,
      }),
    )

    expect(res.status).toBe(403)
    await expectPublicError(res, PUBLIC_ERROR_CODES.projectReadOnly, "errors.projectReadOnly")
  })

  it("restore-key (anonymous) save path is untouched by read-only logic", async () => {
    const { POST } = await import("./route")
    const project = makeProjectSnapshot()
    mocks.saveProject.mockResolvedValue({ status: "saved", project })

    const res = await POST(
      jsonRequest("https://tickward.test/api/projects/save", {
        key: "restoreKey_123",
        project,
      }),
    )

    // Restore-key path must still return 200 OK (no read-only check)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, project })
  })
})

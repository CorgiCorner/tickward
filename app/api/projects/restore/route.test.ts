import { beforeEach, describe, expect, it, vi } from "vitest"

import { ServerPersistenceUnavailableError } from "@/lib/db/prisma.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { makeProjectSnapshot } from "@/test/factories"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  loadProject: vi.fn(),
  loadUserProject: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/project-service.server", () => ({
  loadProject: mocks.loadProject,
  loadUserProject: mocks.loadUserProject,
}))

const actor = { kind: "anonymous" as const, restoreKey: "restoreKey_123" }

describe("GET /api/projects/restore", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.loadProject.mockReset()
    mocks.loadUserProject.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
  })

  it("rejects missing and invalid restore keys", async () => {
    const { GET } = await import("./route")

    expect((await GET(new Request("https://tickward.test/api/projects/restore"))).status).toBe(400)
    expect((await GET(new Request("https://tickward.test/api/projects/restore?key=bad"))).status).toBe(400)
    expect((await GET(new Request("https://tickward.test/api/projects/restore?projectId=bad"))).status).toBe(400)
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
    expect(mocks.loadProject).not.toHaveBeenCalled()
  })

  it("returns 404 when project is not found", async () => {
    const { GET } = await import("./route")
    mocks.loadProject.mockResolvedValue(null)

    const res = await GET(new Request("https://tickward.test/api/projects/restore?key=restoreKey_123"))

    expect(res.status).toBe(404)
    await expectPublicError(res, PUBLIC_ERROR_CODES.notFound, "errors.notFound")
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
    expect(mocks.loadProject).toHaveBeenCalledWith(actor)
  })

  it("returns a public storage error when restore persistence is unavailable", async () => {
    const { GET } = await import("./route")
    mocks.loadProject.mockRejectedValue(new ServerPersistenceUnavailableError())

    const res = await GET(new Request("https://tickward.test/api/projects/restore?key=restoreKey_123"))

    expect(res.status).toBe(503)
    await expectPublicError(res, PUBLIC_ERROR_CODES.storageUnavailable, "errors.storageUnavailable")
  })

  it("does not mask unexpected restore persistence errors", async () => {
    const { GET } = await import("./route")
    mocks.loadProject.mockRejectedValue(new Error("database exploded"))

    await expect(GET(new Request("https://tickward.test/api/projects/restore?key=restoreKey_123"))).rejects.toThrow(
      "database exploded",
    )
  })

  it("returns restored project with private cache headers", async () => {
    const { GET } = await import("./route")
    const restored = { project: makeProjectSnapshot(), source: "project" as const }
    mocks.loadProject.mockResolvedValue(restored)

    const res = await GET(new Request("https://tickward.test/api/projects/restore?key=restoreKey_123"))

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, max-age=10, stale-while-revalidate=30")
    await expect(res.json()).resolves.toEqual(restored)
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
    expect(mocks.loadProject).toHaveBeenCalledWith(actor)
  })

  it("returns signed-in user projects by project id", async () => {
    const { GET } = await import("./route")
    const restored = {
      project: makeProjectSnapshot(),
      source: "project" as const,
      projectId: "project_123",
      ownerId: "user_123",
    }
    mocks.loadUserProject.mockResolvedValue({ status: "ok", data: restored })

    const res = await GET(new Request("https://tickward.test/api/projects/restore?projectId=project_123"))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(restored)
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({ request: expect.any(Request) })
    expect(mocks.loadUserProject).toHaveBeenCalledWith(actor, "project_123")
  })

  it("returns 401 when user project restore has no session actor", async () => {
    const { GET } = await import("./route")
    mocks.getCurrentActor.mockRejectedValue(new Error("missing session"))

    const res = await GET(new Request("https://tickward.test/api/projects/restore?projectId=project_123"))

    expect(res.status).toBe(401)
    await expectPublicError(res, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")
    expect(mocks.loadUserProject).not.toHaveBeenCalled()
  })

  it("returns 401 when restore-key actor resolution fails", async () => {
    const { GET } = await import("./route")
    mocks.getCurrentActor.mockRejectedValue(new Error("missing actor"))

    const res = await GET(new Request("https://tickward.test/api/projects/restore?key=restoreKey_123"))

    expect(res.status).toBe(401)
    await expectPublicError(res, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")
    expect(mocks.loadProject).not.toHaveBeenCalled()
  })

  it("maps user project restore status responses to public errors", async () => {
    const { GET } = await import("./route")

    mocks.loadUserProject.mockResolvedValueOnce({ status: "unauthenticated" })
    const unauthenticated = await GET(new Request("https://tickward.test/api/projects/restore?projectId=project_123"))
    expect(unauthenticated.status).toBe(401)
    await expectPublicError(unauthenticated, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")

    mocks.loadUserProject.mockResolvedValueOnce({ status: "unsupported" })
    const unsupported = await GET(new Request("https://tickward.test/api/projects/restore?projectId=project_123"))
    expect(unsupported.status).toBe(501)
    await expectPublicError(unsupported, PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported")

    mocks.loadUserProject.mockResolvedValueOnce({ status: "not_found" })
    const notFound = await GET(new Request("https://tickward.test/api/projects/restore?projectId=project_123"))
    expect(notFound.status).toBe(404)
    await expectPublicError(notFound, PUBLIC_ERROR_CODES.notFound, "errors.notFound")
  })

  it("returns a public storage error when user project persistence is unavailable", async () => {
    const { GET } = await import("./route")
    mocks.loadUserProject.mockRejectedValue(new ServerPersistenceUnavailableError())

    const res = await GET(new Request("https://tickward.test/api/projects/restore?projectId=project_123"))

    expect(res.status).toBe(503)
    await expectPublicError(res, PUBLIC_ERROR_CODES.storageUnavailable, "errors.storageUnavailable")
  })
})

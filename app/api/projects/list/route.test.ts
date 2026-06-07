import { beforeEach, describe, expect, it, vi } from "vitest"

import { ServerPersistenceUnavailableError } from "@/lib/db/prisma.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  listUserProjects: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/project-service.server", () => ({
  listUserProjects: mocks.listUserProjects,
}))

const actor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }

describe("GET /api/projects/list", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.listUserProjects.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
  })

  it("returns signed-in user projects with private no-store cache headers", async () => {
    const { GET } = await import("./route")
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
    mocks.listUserProjects.mockResolvedValue({ status: "ok", data: projects })

    const res = await GET(new Request("https://tickward.test/api/projects/list"))

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    await expect(res.json()).resolves.toEqual({ projects })
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({ request: expect.any(Request) })
    expect(mocks.listUserProjects).toHaveBeenCalledWith(actor)
  })

  it("returns 401 when no signed-in actor is available", async () => {
    const { GET } = await import("./route")
    mocks.getCurrentActor.mockRejectedValue(new Error("missing session"))

    const res = await GET(new Request("https://tickward.test/api/projects/list"))

    expect(res.status).toBe(401)
    await expectPublicError(res, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")
    expect(mocks.listUserProjects).not.toHaveBeenCalled()
  })

  it("maps service statuses to public errors", async () => {
    const { GET } = await import("./route")

    mocks.listUserProjects.mockResolvedValueOnce({ status: "unauthenticated" })
    const unauthenticated = await GET(new Request("https://tickward.test/api/projects/list"))
    expect(unauthenticated.status).toBe(401)
    await expectPublicError(unauthenticated, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")

    mocks.listUserProjects.mockResolvedValueOnce({ status: "unsupported" })
    const unsupported = await GET(new Request("https://tickward.test/api/projects/list"))
    expect(unsupported.status).toBe(501)
    await expectPublicError(unsupported, PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported")

    mocks.listUserProjects.mockResolvedValueOnce({ status: "not_found" })
    const notFound = await GET(new Request("https://tickward.test/api/projects/list"))
    expect(notFound.status).toBe(404)
    await expectPublicError(notFound, PUBLIC_ERROR_CODES.notFound, "errors.notFound")
  })

  it("returns public storage errors without leaking details", async () => {
    const { GET } = await import("./route")
    mocks.listUserProjects.mockRejectedValue(new ServerPersistenceUnavailableError())

    const res = await GET(new Request("https://tickward.test/api/projects/list"))

    expect(res.status).toBe(503)
    await expectPublicError(res, PUBLIC_ERROR_CODES.storageUnavailable, "errors.storageUnavailable")
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

import { ServerPersistenceUnavailableError } from "@/lib/db/prisma.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  clearProject: vi.fn(),
  clearUserProject: vi.fn(),
  enforceRateLimit: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/project-service.server", () => ({
  clearProject: mocks.clearProject,
  clearUserProject: mocks.clearUserProject,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}))

const actor = { kind: "anonymous" as const, restoreKey: "restoreKey_123" }
const userActor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }

describe("DELETE /api/projects/clear", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.clearProject.mockReset()
    mocks.clearUserProject.mockReset()
    mocks.enforceRateLimit.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.enforceRateLimit.mockResolvedValue(null)
  })

  it("rejects invalid restore keys before rate limiting", async () => {
    const { DELETE } = await import("./route")

    const res = await DELETE(new Request("https://tickward.test/api/projects/clear?key=bad", { method: "DELETE" }))
    const invalidProject = await DELETE(
      new Request("https://tickward.test/api/projects/clear?projectId=bad", { method: "DELETE" }),
    )

    expect(res.status).toBe(400)
    expect(invalidProject.status).toBe(400)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
    expect(mocks.clearProject).not.toHaveBeenCalled()
  })

  it("rate limits valid clear requests before deleting project data", async () => {
    const { DELETE } = await import("./route")
    mocks.enforceRateLimit.mockResolvedValue(new Response("limited", { status: 429 }))

    const res = await DELETE(
      new Request("https://tickward.test/api/projects/clear?key=restoreKey_123", {
        method: "DELETE",
      }),
    )

    expect(res.status).toBe(429)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("clear", "restoreKey_123")
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
    expect(mocks.clearProject).not.toHaveBeenCalled()
  })

  it("clears project data after the rate limit passes", async () => {
    const { DELETE } = await import("./route")

    const res = await DELETE(
      new Request("https://tickward.test/api/projects/clear?key=restoreKey_123", {
        method: "DELETE",
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("clear", "restoreKey_123")
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
    expect(mocks.clearProject).toHaveBeenCalledWith(actor)
  })

  it("returns a public storage error when restore-key persistence is unavailable", async () => {
    const { DELETE } = await import("./route")
    mocks.clearProject.mockRejectedValue(new ServerPersistenceUnavailableError())

    const res = await DELETE(
      new Request("https://tickward.test/api/projects/clear?key=restoreKey_123", {
        method: "DELETE",
      }),
    )

    expect(res.status).toBe(503)
    await expectPublicError(res, PUBLIC_ERROR_CODES.storageUnavailable, "errors.storageUnavailable")
  })

  it("does not mask unexpected restore-key clear errors", async () => {
    const { DELETE } = await import("./route")
    mocks.clearProject.mockRejectedValue(new Error("clear exploded"))

    await expect(
      DELETE(
        new Request("https://tickward.test/api/projects/clear?key=restoreKey_123", {
          method: "DELETE",
        }),
      ),
    ).rejects.toThrow("clear exploded")
  })

  it("clears signed-in user projects by project id", async () => {
    const { DELETE } = await import("./route")
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.clearUserProject.mockResolvedValue({ status: "ok", data: true })

    const res = await DELETE(
      new Request("https://tickward.test/api/projects/clear?projectId=project_123", {
        method: "DELETE",
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("clear", "user:user_123:project:project_123")
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({ request: expect.any(Request) })
    expect(mocks.clearUserProject).toHaveBeenCalledWith(userActor, "project_123")
  })

  it("returns 401 when user project clear has no session actor", async () => {
    const { DELETE } = await import("./route")
    mocks.getCurrentActor.mockRejectedValue(new Error("missing session"))

    const res = await DELETE(
      new Request("https://tickward.test/api/projects/clear?projectId=project_123", {
        method: "DELETE",
      }),
    )

    expect(res.status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.clearUserProject).not.toHaveBeenCalled()
  })

  it("maps user project clear status responses to public errors", async () => {
    const { DELETE } = await import("./route")
    mocks.getCurrentActor.mockResolvedValue(userActor)

    mocks.clearUserProject.mockResolvedValueOnce({ status: "unauthenticated" })
    const unauthenticated = await DELETE(
      new Request("https://tickward.test/api/projects/clear?projectId=project_123", { method: "DELETE" }),
    )
    expect(unauthenticated.status).toBe(401)
    await expectPublicError(unauthenticated, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")

    mocks.clearUserProject.mockResolvedValueOnce({ status: "unsupported" })
    const unsupported = await DELETE(
      new Request("https://tickward.test/api/projects/clear?projectId=project_123", { method: "DELETE" }),
    )
    expect(unsupported.status).toBe(501)
    await expectPublicError(unsupported, PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported")

    mocks.clearUserProject.mockResolvedValueOnce({ status: "not_found" })
    const notFound = await DELETE(
      new Request("https://tickward.test/api/projects/clear?projectId=project_123", { method: "DELETE" }),
    )
    expect(notFound.status).toBe(404)
    await expectPublicError(notFound, PUBLIC_ERROR_CODES.notFound, "errors.notFound")
  })

  it("returns a public storage error when user project persistence is unavailable", async () => {
    const { DELETE } = await import("./route")
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.clearUserProject.mockRejectedValue(new ServerPersistenceUnavailableError())

    const res = await DELETE(
      new Request("https://tickward.test/api/projects/clear?projectId=project_123", {
        method: "DELETE",
      }),
    )

    expect(res.status).toBe(503)
    await expectPublicError(res, PUBLIC_ERROR_CODES.storageUnavailable, "errors.storageUnavailable")
  })

  it("does not mask unexpected user project clear errors", async () => {
    const { DELETE } = await import("./route")
    mocks.getCurrentActor.mockResolvedValue(userActor)
    mocks.clearUserProject.mockRejectedValue(new Error("user clear exploded"))

    await expect(
      DELETE(
        new Request("https://tickward.test/api/projects/clear?projectId=project_123", {
          method: "DELETE",
        }),
      ),
    ).rejects.toThrow("user clear exploded")
  })
})

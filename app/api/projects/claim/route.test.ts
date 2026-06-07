import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Actor } from "@/lib/contracts"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { jsonRequest, makeProjectSnapshot } from "@/test/factories"
import { expectPublicError } from "@/test/public-error-assertions"

const userActor: Actor = { kind: "user", user: { id: "user_123", email: "ada@example.com" } }

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  claimProject: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/project-service.server", () => ({
  claimProject: mocks.claimProject,
}))

describe("POST /api/projects/claim", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.claimProject.mockReset()
    mocks.getCurrentActor.mockResolvedValue(userActor)
  })

  it("rejects invalid JSON", async () => {
    const { POST } = await import("./route")
    const res = await POST(
      new Request("https://tickward.test/api/projects/claim", {
        method: "POST",
        body: "{bad",
      }),
    )

    expect(res.status).toBe(400)
    await expectPublicError(res, PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson")
  })

  it("rejects invalid restore keys before resolving the actor", async () => {
    const { POST } = await import("./route")
    const res = await POST(jsonRequest("https://tickward.test/api/projects/claim", { restoreKey: "bad" }))

    expect(res.status).toBe(400)
    await expectPublicError(res, PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey")
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
    expect(mocks.claimProject).not.toHaveBeenCalled()
  })

  it("returns 401 when no signed-in user can claim the project", async () => {
    const { POST } = await import("./route")
    mocks.claimProject.mockResolvedValue({ status: "unauthenticated" })

    const res = await POST(jsonRequest("https://tickward.test/api/projects/claim", { restoreKey: "restoreKey_123" }))

    expect(res.status).toBe(401)
    await expectPublicError(res, PUBLIC_ERROR_CODES.claimSignInRequired, "errors.claimSignInRequired")
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
  })

  it("returns 501 until a private claim adapter is configured", async () => {
    const { POST } = await import("./route")
    mocks.claimProject.mockResolvedValue({ status: "unsupported" })

    const res = await POST(jsonRequest("https://tickward.test/api/projects/claim", { restoreKey: "restoreKey_123" }))

    expect(res.status).toBe(501)
    await expectPublicError(res, PUBLIC_ERROR_CODES.claimUnsupported, "errors.claimUnsupported")
  })

  it("returns 404 when the anonymous project token cannot be found", async () => {
    const { POST } = await import("./route")
    mocks.claimProject.mockResolvedValue({ status: "not_found" })

    const res = await POST(jsonRequest("https://tickward.test/api/projects/claim", { restoreKey: "restoreKey_123" }))

    expect(res.status).toBe(404)
    await expectPublicError(res, PUBLIC_ERROR_CODES.notFound, "errors.notFound")
  })

  it("returns the claimed project for future user-backed adapters", async () => {
    const { POST } = await import("./route")
    const claimed = {
      projectId: "project_123",
      project: makeProjectSnapshot(),
      owner: { id: "user_123", email: "ada@example.com" },
      claimedAt: "2026-06-05T00:00:00.000Z",
    }
    mocks.claimProject.mockResolvedValue({ status: "claimed", project: claimed })

    const res = await POST(jsonRequest("https://tickward.test/api/projects/claim", { restoreKey: "restoreKey_123" }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, project: claimed })
    expect(mocks.claimProject).toHaveBeenCalledWith({ actor: userActor, restoreKey: "restoreKey_123" })
  })
})

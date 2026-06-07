import { beforeEach, describe, expect, it, vi } from "vitest"

import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { jsonRequest } from "@/test/factories"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  getExistingTimerShare: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/share-service.server", () => ({
  getExistingTimerShare: mocks.getExistingTimerShare,
}))

const actor = { kind: "anonymous" as const, restoreKey: "restoreKey_123" }
const userActor = { kind: "user" as const, user: { id: "user_123", role: "user" as const } }

describe("POST /api/share/status", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.getExistingTimerShare.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.getExistingTimerShare.mockResolvedValue(null)
  })

  it("rejects malformed bodies and invalid owners", async () => {
    const { POST } = await import("./route")

    expect(
      (
        await POST(
          new Request("https://tickward.test/api/share/status", {
            method: "POST",
            body: "{bad",
          }),
        )
      ).status,
    ).toBe(400)

    const invalidOwner = await POST(
      jsonRequest("https://tickward.test/api/share/status", {
        owner: { restoreKey: "bad", timerId: "timer-a" },
      }),
    )

    expect(invalidOwner.status).toBe(400)
    await expectPublicError(invalidOwner, PUBLIC_ERROR_CODES.invalidShareOwner, "errors.invalidShareOwner")
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
    expect(mocks.getExistingTimerShare).not.toHaveBeenCalled()
  })

  it("returns a known share link without creating it again", async () => {
    const { POST } = await import("./route")
    mocks.getCurrentActor.mockResolvedValueOnce(userActor)
    mocks.getExistingTimerShare.mockResolvedValueOnce({
      shareId: "timer_existingShareId1234567890",
      url: "/share/timer_existingShareId1234567890",
    })

    const res = await POST(
      jsonRequest("https://tickward.test/api/share/status", {
        owner: { projectId: "project_123", restoreKey: "restoreKey_123", timerId: "timer-a" },
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      shareId: "timer_existingShareId1234567890",
      url: "/share/timer_existingShareId1234567890",
    })
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({ request: expect.any(Request) })
    expect(mocks.getExistingTimerShare).toHaveBeenCalledWith({
      actor: userActor,
      timerId: "timer-a",
      projectId: "project_123",
    })
  })

  it("returns a null URL when the timer has no share link yet", async () => {
    const { POST } = await import("./route")

    const res = await POST(
      jsonRequest("https://tickward.test/api/share/status", {
        owner: { restoreKey: "restoreKey_123", timerId: "timer-a" },
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ shareId: null, url: null })
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({
      restoreKey: "restoreKey_123",
      request: expect.any(Request),
    })
  })

  it("returns sign-in required when a user project has no session actor", async () => {
    const { POST } = await import("./route")
    mocks.getCurrentActor.mockRejectedValueOnce(new Error("missing session"))

    const res = await POST(
      jsonRequest("https://tickward.test/api/share/status", {
        owner: { projectId: "project_123", timerId: "timer-a" },
      }),
    )

    expect(res.status).toBe(401)
    await expectPublicError(res, PUBLIC_ERROR_CODES.signInRequired, "errors.signInRequired")
    expect(mocks.getExistingTimerShare).not.toHaveBeenCalled()
  })
})

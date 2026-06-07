import { beforeEach, describe, expect, it, vi } from "vitest"

import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { jsonRequest } from "@/test/factories"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  createTimerShare: vi.fn(),
  enforceRateLimit: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/share-service.server", () => ({
  createTimerShare: mocks.createTimerShare,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}))

const actor = { kind: "anonymous" as const, restoreKey: "restoreKey_123" }
const userActor = { kind: "user" as const, user: { id: "user_123", role: "user" as const } }

describe("POST /api/share/create", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset()
    mocks.createTimerShare.mockReset()
    mocks.enforceRateLimit.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.createTimerShare.mockResolvedValue({ shareId: "shareId_12345", url: "/share/shareId_12345" })
    mocks.enforceRateLimit.mockResolvedValue(null)
  })

  it("rejects malformed bodies and invalid owners", async () => {
    const { POST } = await import("./route")

    expect(
      (
        await POST(
          new Request("https://tickward.test/api/share/create", {
            method: "POST",
            body: "{bad",
          }),
        )
      ).status,
    ).toBe(400)

    expect(
      (
        await POST(
          jsonRequest("https://tickward.test/api/share/create", {
            owner: null,
          }),
        )
      ).status,
    ).toBe(400)

    const invalidTimerId = await POST(
      jsonRequest("https://tickward.test/api/share/create", {
        owner: { restoreKey: "restoreKey_123", timerId: "../bad" },
      }),
    )
    expect(invalidTimerId.status).toBe(400)
    await expectPublicError(invalidTimerId, PUBLIC_ERROR_CODES.invalidShareOwner, "errors.invalidShareOwner")
  })

  it("requires a valid owner restore key", async () => {
    const { POST } = await import("./route")

    const missingKey = await POST(
      jsonRequest("https://tickward.test/api/share/create", {
        owner: { restoreKey: "bad", timerId: "timer-a" },
      }),
    )
    expect(missingKey.status).toBe(400)
    await expectPublicError(missingKey, PUBLIC_ERROR_CODES.invalidShareOwner, "errors.invalidShareOwner")
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
    expect(mocks.createTimerShare).not.toHaveBeenCalled()
  })

  it("rate limits valid share creation before writes", async () => {
    const { POST } = await import("./route")
    mocks.enforceRateLimit.mockResolvedValue(new Response("limited", { status: 429 }))

    const res = await POST(
      jsonRequest("https://tickward.test/api/share/create", {
        owner: { restoreKey: "restoreKey_123", timerId: "timer-a" },
      }),
    )

    expect(res.status).toBe(429)
    await expect(res.text()).resolves.toBe("limited")
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("share-create", "restoreKey_123")
    expect(mocks.getCurrentActor).not.toHaveBeenCalled()
    expect(mocks.createTimerShare).not.toHaveBeenCalled()
  })

  it("creates a share through the actor-aware service", async () => {
    const { POST } = await import("./route")
    mocks.getCurrentActor.mockResolvedValueOnce(userActor)

    const res = await POST(
      jsonRequest("https://tickward.test/api/share/create", {
        owner: { projectId: "project_123", timerId: "timer-a" },
      }),
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as { shareId: string; url: string }
    expect(data).toEqual({ shareId: "shareId_12345", url: "/share/shareId_12345" })
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("share-create", "project:project_123")
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({ request: expect.any(Request) })
    expect(mocks.createTimerShare).toHaveBeenCalledWith({
      actor: userActor,
      timerId: "timer-a",
      projectId: "project_123",
    })
    expect(mocks.createTimerShare.mock.calls[0]?.[0]).not.toHaveProperty("owner")
    expect(mocks.createTimerShare.mock.calls[0]?.[0]).not.toHaveProperty("description")
  })

  it("returns not found when the live timer cannot be published", async () => {
    const { POST } = await import("./route")
    mocks.createTimerShare.mockResolvedValue(null)

    const res = await POST(
      jsonRequest("https://tickward.test/api/share/create", {
        owner: { restoreKey: "restoreKey_123", timerId: "timer-a" },
      }),
    )

    expect(res.status).toBe(404)
    await expectPublicError(res, PUBLIC_ERROR_CODES.notFound, "errors.notFound")
  })
})

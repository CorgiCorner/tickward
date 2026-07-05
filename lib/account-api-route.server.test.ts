import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  readAccountRouteJson,
  readOptionalAccountRouteJson,
  requireSignedInUser,
} from "@/lib/account-api-route.server"

const userActor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }

describe("account-api-route.server", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.getCurrentActor.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns signed-in user actors through the actor module", async () => {
    const req = new Request("https://tickward.test/api/account")
    mocks.getCurrentActor.mockResolvedValue(userActor)

    await expect(requireSignedInUser(req, "Sign in.")).resolves.toBe(userActor)
    expect(mocks.getCurrentActor).toHaveBeenCalledWith({ request: req })
  })

  it("returns the configured unauthorized response when actor lookup fails", async () => {
    mocks.getCurrentActor.mockRejectedValue(new Error("missing session"))

    const res = await requireSignedInUser(new Request("https://tickward.test/api/account"), "Sign in.")

    expect(res).toBeInstanceOf(Response)
    const unauthorized = res as Response
    expect(unauthorized.status).toBe(401)
    await expect(unauthorized.json()).resolves.toEqual({ error: { type: "unauthorized", message: "Sign in." } })
  })

  it("returns rate limit responses from the rate-limit module", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, headers: { "retry-after": "30" } })

    const res = await enforceAccountRateLimit({
      bucket: "webhook-test",
      key: "user:user_123:webhook:wh_123",
      limitedMessage: "Too many test webhook requests.",
    })

    expect(mocks.checkRateLimit).toHaveBeenCalledWith("webhook-test", "user:user_123:webhook:wh_123")
    expect(res).toBeInstanceOf(Response)
    const rateLimited = res as Response
    expect(rateLimited.status).toBe(429)
    expect(rateLimited.headers.get("retry-after")).toBe("30")
    await expect(rateLimited.json()).resolves.toEqual({
      error: { type: "rate_limited", message: "Too many test webhook requests." },
    })
  })

  it("returns null when the rate limit allows the request", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })

    await expect(enforceAccountRateLimit({ bucket: "api-key-management", key: "user:user_123" })).resolves.toBeNull()
  })

  it("returns the shared unavailable response when rate limiting fails", async () => {
    mocks.checkRateLimit.mockRejectedValue(new Error("redis unavailable"))

    const res = await enforceAccountRateLimit({ bucket: "api-key-management", key: "user:user_123" })

    expect(res).toBeInstanceOf(Response)
    const unavailable = res as Response
    expect(unavailable.status).toBe(503)
    await expect(unavailable.json()).resolves.toEqual({
      error: { type: "rate_limit_unavailable", message: "Rate limit unavailable." },
    })
  })

  it("parses required and optional JSON bodies with their route contracts", async () => {
    await expect(
      readAccountRouteJson(
        new Request("https://tickward.test/api/account", { method: "POST", body: JSON.stringify({ name: "Demo" }) }),
      ),
    ).resolves.toEqual({ name: "Demo" })

    const invalid = await readAccountRouteJson(
      new Request("https://tickward.test/api/account", { method: "POST", body: "{" }),
    )
    expect(invalid).toBeInstanceOf(Response)
    await expect((invalid as Response).json()).resolves.toEqual({
      error: { type: "validation_error", message: "Request body must be valid JSON." },
    })

    await expect(
      readOptionalAccountRouteJson(new Request("https://tickward.test/api/account", { method: "POST", body: "{" })),
    ).resolves.toBeNull()
  })

  it("logs and returns storage-unavailable responses", async () => {
    const error = new Error("storage unavailable")
    vi.spyOn(console, "error").mockImplementation(() => {})

    const res = accountRouteStorageUnavailable({
      error,
      logName: "apiKeys",
      message: "API key storage is unavailable.",
      operation: "list",
    })

    expect(console.error).toHaveBeenCalledWith("[tickward] apiKeys.list", error)
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      error: { type: "storage_unavailable", message: "API key storage is unavailable." },
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  revokeApiKeyForUser: vi.fn(),
  updateApiKeyForUser: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock("@/lib/api-keys.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-keys.server")>()),
  revokeApiKeyForUser: mocks.revokeApiKeyForUser,
  updateApiKeyForUser: mocks.updateApiKeyForUser,
}))

const actor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }
const context = { params: Promise.resolve({ id: "key_123" }) }

describe("/api/account/api-keys/:id", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.revokeApiKeyForUser.mockReset()
    mocks.updateApiKeyForUser.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("updates API key metadata", async () => {
    const { PATCH } = await import("./route")
    mocks.updateApiKeyForUser.mockResolvedValue({ id: "key_123", object: "api_key", name: "Read only" })

    const res = await PATCH(
      new Request("https://tickward.test/api/account/api-keys/key_123", {
        method: "PATCH",
        body: JSON.stringify({ name: "Read only", permission: "read" }),
      }),
      context,
    )

    expect(res.status).toBe(200)
    expect(mocks.updateApiKeyForUser).toHaveBeenCalledWith({
      id: "key_123",
      name: "Read only",
      permission: "read",
      user: actor.user,
    })
  })

  it("revokes API keys without returning the token", async () => {
    const { DELETE } = await import("./route")
    mocks.revokeApiKeyForUser.mockResolvedValue({ id: "key_123", object: "api_key" })

    const res = await DELETE(new Request("https://tickward.test/api/account/api-keys/key_123"), context)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ object: "api_key", id: "key_123", deleted: true })
    expect(mocks.revokeApiKeyForUser).toHaveBeenCalledWith({ id: "key_123", user: actor.user })
  })

  it("returns not found when the key is missing or revoked", async () => {
    const { PATCH, DELETE } = await import("./route")
    mocks.updateApiKeyForUser.mockResolvedValueOnce(null)
    mocks.revokeApiKeyForUser.mockResolvedValueOnce(null)

    const update = await PATCH(
      new Request("https://tickward.test/api/account/api-keys/key_123", {
        method: "PATCH",
        body: JSON.stringify({ name: "Missing" }),
      }),
      context,
    )
    expect(update.status).toBe(404)

    const revoke = await DELETE(new Request("https://tickward.test/api/account/api-keys/key_123"), context)
    expect(revoke.status).toBe(404)
  })

  it("rejects empty updates", async () => {
    const { PATCH } = await import("./route")

    const res = await PATCH(
      new Request("https://tickward.test/api/account/api-keys/key_123", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      context,
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(mocks.updateApiKeyForUser).not.toHaveBeenCalled()
  })

  it("returns a controlled storage error when key storage is unavailable", async () => {
    const { PATCH, DELETE } = await import("./route")
    mocks.updateApiKeyForUser.mockRejectedValueOnce(new Error("table api_key missing"))
    mocks.revokeApiKeyForUser.mockRejectedValueOnce(new Error("table api_key missing"))

    const update = await PATCH(
      new Request("https://tickward.test/api/account/api-keys/key_123", {
        method: "PATCH",
        body: JSON.stringify({ name: "Read only" }),
      }),
      context,
    )
    expect(update.status).toBe(503)
    await expect(update.json()).resolves.toMatchObject({
      error: { type: "storage_unavailable", message: "API key storage is unavailable." },
    })

    const revoke = await DELETE(new Request("https://tickward.test/api/account/api-keys/key_123"), context)
    expect(revoke.status).toBe(503)
    await expect(revoke.json()).resolves.toMatchObject({
      error: { type: "storage_unavailable", message: "API key storage is unavailable." },
    })
  })
})

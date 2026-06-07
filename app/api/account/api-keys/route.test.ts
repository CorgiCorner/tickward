import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createApiKeyForUser: vi.fn(),
  getCurrentActor: vi.fn(),
  listApiKeysForUser: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock("@/lib/api-keys.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-keys.server")>()),
  createApiKeyForUser: mocks.createApiKeyForUser,
  listApiKeysForUser: mocks.listApiKeysForUser,
}))

const actor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }

describe("/api/account/api-keys", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: { "ratelimit-limit": "20" } })
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.createApiKeyForUser.mockReset()
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.listApiKeysForUser.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("lists API keys for the signed-in user", async () => {
    const { GET } = await import("./route")
    mocks.listApiKeysForUser.mockResolvedValue([{ id: "key_123", object: "api_key", name: "Production" }])

    const res = await GET(new Request("https://tickward.test/api/account/api-keys"))

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    await expect(res.json()).resolves.toMatchObject({ object: "list", data: [{ id: "key_123" }] })
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("api-key-management", "user:user_123")
    expect(mocks.listApiKeysForUser).toHaveBeenCalledWith(actor.user)
  })

  it("creates a key and returns the one-time token", async () => {
    const { POST } = await import("./route")
    mocks.createApiKeyForUser.mockResolvedValue({
      id: "key_123",
      object: "api_key",
      name: "Production",
      permission: "read",
      token: "tw_secret",
    })

    const res = await POST(
      new Request("https://tickward.test/api/account/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "Production", permission: "read" }),
      }),
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({ id: "key_123", token: "tw_secret" })
    expect(mocks.createApiKeyForUser).toHaveBeenCalledWith({
      name: "Production",
      permission: "read",
      user: actor.user,
    })
  })

  it("rejects anonymous users and invalid permissions", async () => {
    const { GET, POST } = await import("./route")
    mocks.getCurrentActor.mockRejectedValueOnce(new Error("missing session"))

    const anonymous = await GET(new Request("https://tickward.test/api/account/api-keys"))
    expect(anonymous.status).toBe(401)

    const invalid = await POST(
      new Request("https://tickward.test/api/account/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "Production", permission: "write" }),
      }),
    )
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
  })

  it("rate limits key management", async () => {
    const { GET } = await import("./route")
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, headers: { "retry-after": "10" } })

    const res = await GET(new Request("https://tickward.test/api/account/api-keys"))

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("10")
  })

  it("returns a controlled storage error when key storage is unavailable", async () => {
    const { GET, POST } = await import("./route")
    mocks.listApiKeysForUser.mockRejectedValueOnce(new Error("table api_key missing"))
    mocks.createApiKeyForUser.mockRejectedValueOnce(new Error("table api_key missing"))

    const list = await GET(new Request("https://tickward.test/api/account/api-keys"))
    expect(list.status).toBe(503)
    await expect(list.json()).resolves.toMatchObject({
      error: { type: "storage_unavailable", message: "API key storage is unavailable." },
    })

    const create = await POST(
      new Request("https://tickward.test/api/account/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "Production", permission: "read" }),
      }),
    )
    expect(create.status).toBe(503)
    await expect(create.json()).resolves.toMatchObject({
      error: { type: "storage_unavailable", message: "API key storage is unavailable." },
    })
  })
})

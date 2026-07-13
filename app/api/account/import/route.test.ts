import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentActor: vi.fn(),
  importAccountProjects: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({ getCurrentActor: mocks.getCurrentActor }))
vi.mock("@/lib/rate-limit.server", () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock("@/lib/account-migration.server", () => ({ importAccountProjects: mocks.importAccountProjects }))

const actor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }
const exportedAt = "2026-07-10T18:00:00.000Z"
const requestBody = {
  conflictStrategy: "skip",
  export: {
    format: "tickward-account",
    version: 1,
    exportedAt,
    projects: [
      {
        id: "project_123",
        name: "Launch",
        color: null,
        createdAt: exportedAt,
        updatedAt: exportedAt,
        claimedAt: null,
        snapshot: { version: 2, name: "Launch", timers: [], spaces: [], updatedAt: exportedAt },
      },
    ],
  },
}

function request(body: unknown = requestBody) {
  return new Request("https://tickward.test/api/account/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/account/import", () => {
  beforeEach(() => {
    mocks.getCurrentActor.mockReset().mockResolvedValue(actor)
    mocks.checkRateLimit.mockReset().mockResolvedValue({ allowed: true, headers: {} })
    mocks.importAccountProjects.mockReset().mockResolvedValue({
      accountPreferencesImported: false,
      created: ["project_123"],
      replaced: [],
      conflicts: [],
      notificationPreferencesImported: 0,
      profileImported: false,
      readOnlyProjectIds: [],
    })
  })

  it("requires a signed-in account", async () => {
    const { POST } = await import("./route")
    mocks.getCurrentActor.mockResolvedValueOnce({ kind: "anonymous", restoreKey: "restore_123" })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(mocks.importAccountProjects).not.toHaveBeenCalled()
  })

  it("rejects unsupported export files", async () => {
    const { POST } = await import("./route")

    const response = await POST(request({ export: { format: "unknown", projects: [] } }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(mocks.importAccountProjects).not.toHaveBeenCalled()
  })

  it("imports valid projects and reports read-only overflow", async () => {
    const { POST } = await import("./route")
    mocks.importAccountProjects.mockResolvedValueOnce({
      accountPreferencesImported: true,
      created: ["project_123", "project_over_limit"],
      replaced: [],
      conflicts: [],
      notificationPreferencesImported: 2,
      profileImported: true,
      readOnlyProjectIds: ["project_over_limit"],
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      accountPreferencesImported: true,
      created: ["project_123", "project_over_limit"],
      replaced: [],
      conflicts: [],
      notificationPreferencesImported: 2,
      profileImported: true,
      readOnlyProjectIds: ["project_over_limit"],
    })
    expect(mocks.importAccountProjects).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ conflictStrategy: "skip" }),
    )
  })

  it("returns 501 when the deployment has no import adapter", async () => {
    const { POST } = await import("./route")
    mocks.importAccountProjects.mockResolvedValueOnce(null)

    const response = await POST(request())

    expect(response.status).toBe(501)
    await expect(response.json()).resolves.toMatchObject({ error: { type: "not_supported" } })
  })

  it("applies a dedicated account import rate limit", async () => {
    const { POST } = await import("./route")
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, headers: { "retry-after": "60" } })

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("account-import", "user:user_123")
    expect(mocks.importAccountProjects).not.toHaveBeenCalled()
  })
})

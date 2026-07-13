import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimAdminBootstrap: vi.fn(),
  getCurrentActor: vi.fn(),
}))

vi.mock("@/lib/admin-bootstrap.server", () => ({ claimAdminBootstrap: mocks.claimAdminBootstrap }))
vi.mock("@/lib/actor.server", () => ({ getCurrentActor: mocks.getCurrentActor }))

describe("POST /api/setup/claim-admin", () => {
  beforeEach(() => {
    mocks.claimAdminBootstrap.mockReset()
    mocks.getCurrentActor.mockReset()
  })

  it("returns 401 for anonymous actors", async () => {
    mocks.getCurrentActor.mockResolvedValue({ kind: "anonymous", restoreKey: "restoreKey_123" })
    const { POST } = await import("./route")

    const response = await POST(new Request("https://tickward.test/api/setup/claim-admin", { method: "POST" }))

    expect(response.status).toBe(401)
    expect(mocks.claimAdminBootstrap).not.toHaveBeenCalled()
  })

  it("returns 409 when an administrator already exists", async () => {
    mocks.getCurrentActor.mockResolvedValue({ kind: "user", user: { id: "user_1" } })
    mocks.claimAdminBootstrap.mockResolvedValue(false)
    const { POST } = await import("./route")

    const response = await POST(new Request("https://tickward.test/api/setup/claim-admin", { method: "POST" }))

    expect(response.status).toBe(409)
  })

  it("promotes the authenticated user when the bootstrap is open", async () => {
    mocks.getCurrentActor.mockResolvedValue({ kind: "user", user: { id: "user_1" } })
    mocks.claimAdminBootstrap.mockResolvedValue(true)
    const { POST } = await import("./route")

    const response = await POST(new Request("https://tickward.test/api/setup/claim-admin", { method: "POST" }))

    expect(response.status).toBe(200)
    expect(mocks.claimAdminBootstrap).toHaveBeenCalledWith("user_1")
  })
})

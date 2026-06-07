import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  handlePublicApiV1Request: vi.fn(),
}))

vi.mock("@/lib/public-api-v1.server", () => ({
  handlePublicApiV1Request: mocks.handlePublicApiV1Request,
}))

describe("/api/v1 route", () => {
  beforeEach(() => {
    mocks.handlePublicApiV1Request.mockReset()
    mocks.handlePublicApiV1Request.mockResolvedValue(new Response("{}"))
  })

  it("forwards versioned paths and methods to the public API router", async () => {
    const { GET, POST, PATCH, DELETE } = await import("./route")
    const context = { params: Promise.resolve({ path: ["projects", "project_123", "timers"] }) }
    const req = new Request("https://tickward.test/api/v1/projects/project_123/timers")

    await GET(req, context)
    await POST(req, context)
    await PATCH(req, context)
    await DELETE(req, context)

    expect(mocks.handlePublicApiV1Request).toHaveBeenNthCalledWith(1, "GET", req, ["projects", "project_123", "timers"])
    expect(mocks.handlePublicApiV1Request).toHaveBeenNthCalledWith(2, "POST", req, [
      "projects",
      "project_123",
      "timers",
    ])
    expect(mocks.handlePublicApiV1Request).toHaveBeenNthCalledWith(3, "PATCH", req, [
      "projects",
      "project_123",
      "timers",
    ])
    expect(mocks.handlePublicApiV1Request).toHaveBeenNthCalledWith(4, "DELETE", req, [
      "projects",
      "project_123",
      "timers",
    ])
  })
})

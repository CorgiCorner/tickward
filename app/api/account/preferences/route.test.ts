import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAccountPreferencesForUser: vi.fn(),
  getCurrentActor: vi.fn(),
  updateAccountPreferencesForUser: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/account-preferences.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account-preferences.server")>()),
  getAccountPreferencesForUser: mocks.getAccountPreferencesForUser,
  updateAccountPreferencesForUser: mocks.updateAccountPreferencesForUser,
}))

const actor = { kind: "user" as const, user: { id: "user_123", email: "ada@example.com" } }
const preferences = {
  object: "account_preferences",
  default_timezone: "Europe/Warsaw",
  email_reminders: false,
  full_page_alarm: true,
  in_app_notifications: true,
  notification_sound: "polite",
}

describe("/api/account/preferences", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.getAccountPreferencesForUser.mockReset()
    mocks.getAccountPreferencesForUser.mockResolvedValue(preferences)
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue(actor)
    mocks.updateAccountPreferencesForUser.mockReset()
    mocks.updateAccountPreferencesForUser.mockResolvedValue(preferences)
  })

  it("reads account preferences for a signed-in user", async () => {
    const { GET } = await import("./route")

    const res = await GET(new Request("https://app.example.test/api/account/preferences"))

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    await expect(res.json()).resolves.toMatchObject(preferences)
    expect(mocks.getAccountPreferencesForUser).toHaveBeenCalledWith(actor.user)
  })

  it("patches account preferences after validation", async () => {
    const { PATCH } = await import("./route")
    const patch = {
      default_timezone: null,
      email_reminders: true,
      full_page_alarm: false,
      in_app_notifications: false,
      notification_sound: "glass",
    }

    const res = await PATCH(
      new Request("https://app.example.test/api/account/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject(preferences)
    expect(mocks.updateAccountPreferencesForUser).toHaveBeenCalledWith(actor.user, patch)
  })

  it("requires a signed-in user", async () => {
    const { GET } = await import("./route")
    mocks.getCurrentActor.mockRejectedValueOnce(new Error("missing session"))

    const res = await GET(new Request("https://app.example.test/api/account/preferences"))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "unauthorized" } })
  })

  it("rejects invalid preferences", async () => {
    const { PATCH } = await import("./route")

    const res = await PATCH(
      new Request("https://app.example.test/api/account/preferences", {
        method: "PATCH",
        body: JSON.stringify({ notification_sound: "legacy" }),
      }),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: { type: "validation_error" } })
    expect(mocks.updateAccountPreferencesForUser).not.toHaveBeenCalled()
  })

  it("rejects device notification capability as an account preference", async () => {
    const { PATCH } = await import("./route")

    const res = await PATCH(
      new Request("https://app.example.test/api/account/preferences", {
        method: "PATCH",
        body: JSON.stringify({ browser_notifications_enabled: true }),
      }),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: {
        details: [expect.objectContaining({ message: expect.stringContaining("Unrecognized key") })],
        type: "validation_error",
      },
    })
    expect(mocks.updateAccountPreferencesForUser).not.toHaveBeenCalled()
  })

  it("returns a controlled storage error", async () => {
    const { GET } = await import("./route")
    mocks.getAccountPreferencesForUser.mockRejectedValueOnce(new Error("database unavailable"))

    const res = await GET(new Request("https://app.example.test/api/account/preferences"))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      error: { type: "storage_unavailable", message: "Settings storage is unavailable." },
    })
  })
})

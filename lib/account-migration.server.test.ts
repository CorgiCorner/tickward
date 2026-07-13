import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getEntitlementsForActor: vi.fn(), importUserProjects: vi.fn() }))

vi.mock("@/lib/entitlements.server", () => ({
  getEntitlementsForActor: mocks.getEntitlementsForActor,
}))

vi.mock("@/lib/server-adapters.server", () => ({
  getServerAdapters: () => ({ projectRepository: { importUserProjects: mocks.importUserProjects } }),
}))

const actor = { kind: "user" as const, user: { id: "user_1", email: "ada@example.com" } }
const exportedAt = "2026-07-10T18:00:00.000Z"
const input = {
  conflictStrategy: "skip" as const,
  export: {
    format: "tickward-account" as const,
    version: 1 as const,
    exportedAt,
    accountPreferences: {
      object: "account_preferences" as const,
      default_timezone: "Europe/Warsaw",
      email_reminders: true,
      full_page_alarm: false,
      in_app_notifications: true,
      notification_sound: "chord" as const,
    },
    notificationPreferences: [
      {
        targetType: "user",
        targetId: "global",
        channels: { in_app: true },
        presentation: { sound: "chord" },
        createdAt: exportedAt,
        updatedAt: exportedAt,
      },
    ],
    user: {
      id: "user_source",
      email: "source@example.com",
      name: "Source Profile",
      createdAt: exportedAt,
    },
    projects: [
      {
        id: "project_123",
        name: "Launch",
        color: null,
        createdAt: exportedAt,
        updatedAt: exportedAt,
        claimedAt: null,
        snapshot: { version: 2 as const, name: "Launch", timers: [], spaces: [], updatedAt: exportedAt },
      },
    ],
  },
}

describe("importAccountProjects", () => {
  beforeEach(() => {
    mocks.getEntitlementsForActor.mockReset().mockResolvedValue({ maxProjects: 13 })
    mocks.importUserProjects.mockReset().mockResolvedValue({
      accountPreferencesImported: false,
      created: ["project_123"],
      replaced: [],
      conflicts: [],
      notificationPreferencesImported: 0,
      profileImported: false,
      readOnlyProjectIds: [],
    })
  })

  it("passes the target account project limit to the repository", async () => {
    const { importAccountProjects } = await import("./account-migration.server")

    await importAccountProjects(actor, input, new Date(exportedAt))

    expect(mocks.importUserProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        conflictStrategy: "skip",
        importedAt: exportedAt,
        maxProjects: 13,
        accountPreferences: input.export.accountPreferences,
        notificationPreferences: input.export.notificationPreferences,
        profileName: "Source Profile",
        user: actor.user,
      }),
    )
    expect(mocks.getEntitlementsForActor).toHaveBeenCalledWith(actor)
  })
})

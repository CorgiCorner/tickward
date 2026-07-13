import { describe, expect, it } from "vitest"

import { accountExportSchema, planAccountProjectImport, type AccountMigrationProject } from "@/lib/account-migration"

function project(id: string, createdAt: string): AccountMigrationProject {
  return {
    id,
    name: id,
    color: null,
    createdAt,
    updatedAt: createdAt,
    claimedAt: null,
    snapshot: { version: 2, name: id, timers: [], spaces: [], updatedAt: createdAt },
  }
}

describe("planAccountProjectImport", () => {
  it("validates transferable account and notification preferences", () => {
    const parsed = accountExportSchema.safeParse({
      format: "tickward-account",
      version: 1,
      exportedAt: "2026-07-10T18:00:00.000Z",
      projects: [],
      accountPreferences: {
        object: "account_preferences",
        default_timezone: "Europe/Warsaw",
        email_reminders: true,
        full_page_alarm: false,
        in_app_notifications: true,
        notification_sound: "chord",
      },
      notificationPreferences: [
        {
          targetType: "user",
          targetId: "global",
          channels: { email: true },
          presentation: { sound: "chord" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      user: {
        id: "user_source",
        email: "source@example.com",
        name: "Source Profile",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects duplicate project ids in an export", () => {
    const duplicate = project("project_same", "2026-02-01T00:00:00.000Z")
    const parsed = accountExportSchema.safeParse({
      format: "tickward-account",
      version: 1,
      exportedAt: "2026-07-10T18:00:00.000Z",
      projects: [duplicate, duplicate],
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects duplicate notification preference targets", () => {
    const preference = {
      targetType: "user",
      targetId: "global",
      channels: { email: true },
      presentation: { sound: "chord" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    }
    const parsed = accountExportSchema.safeParse({
      format: "tickward-account",
      version: 1,
      exportedAt: "2026-07-10T18:00:00.000Z",
      projects: [],
      notificationPreferences: [preference, preference],
    })

    expect(parsed.success).toBe(false)
  })

  it("keeps existing projects editable and marks imported overflow read-only", () => {
    const plan = planAccountProjectImport({
      conflictStrategy: "skip",
      existingProjects: [
        { id: "project_existing", ownerId: "user_1", claimedAt: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      importedAt: "2026-07-10T18:00:00.000Z",
      maxProjects: 2,
      projects: [
        project("project_newer", "2026-06-01T00:00:00.000Z"),
        project("project_older", "2026-02-01T00:00:00.000Z"),
      ],
      userId: "user_1",
    })

    expect(plan.conflicts).toEqual([])
    expect(plan.actions.map(({ project: item, readOnly }) => ({ id: item.id, readOnly }))).toEqual([
      { id: "project_older", readOnly: false },
      { id: "project_newer", readOnly: true },
    ])
  })

  it("skips same-account conflicts by default", () => {
    const plan = planAccountProjectImport({
      conflictStrategy: "skip",
      existingProjects: [
        { id: "project_same", ownerId: "user_1", claimedAt: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      importedAt: "2026-07-10T18:00:00.000Z",
      maxProjects: 10,
      projects: [project("project_same", "2026-02-01T00:00:00.000Z")],
      userId: "user_1",
    })

    expect(plan.actions).toEqual([])
    expect(plan.conflicts).toEqual([{ projectId: "project_same", reason: "already_exists" }])
  })

  it("replaces only a project owned by the importing account", () => {
    const plan = planAccountProjectImport({
      conflictStrategy: "replace",
      existingProjects: [
        {
          id: "project_owned",
          ownerId: "user_1",
          claimedAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        { id: "project_other", ownerId: "user_2", claimedAt: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      importedAt: "2026-07-10T18:00:00.000Z",
      maxProjects: 10,
      projects: [
        project("project_owned", "2026-02-01T00:00:00.000Z"),
        project("project_other", "2026-02-01T00:00:00.000Z"),
      ],
      userId: "user_1",
    })

    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]).toMatchObject({ kind: "replace", claimedAt: "2026-01-02T00:00:00.000Z" })
    expect(plan.conflicts).toEqual([{ projectId: "project_other", reason: "id_unavailable" }])
  })
})

import { z } from "zod"

import { accountPreferencesRecordSchema } from "@/lib/account-preferences"
import { isProjectSnapshot, isValidProjectId, type ProjectSnapshotV2 } from "@/lib/project-model"
import { readOnlyProjectIds, type ProjectMembership } from "@/lib/project-lock"

export const ACCOUNT_EXPORT_FORMAT = "tickward-account"
export const ACCOUNT_EXPORT_VERSION = 1

const isoDateSchema = z.string().datetime({ offset: true })
const projectSnapshotSchema = z.custom<ProjectSnapshotV2>(isProjectSnapshot, "Invalid project snapshot.")

export const accountMigrationProjectSchema = z.object({
  id: z.string().refine(isValidProjectId, "Invalid project id."),
  name: z.string().min(1).max(40),
  color: z.string().nullable().optional(),
  snapshot: projectSnapshotSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  claimedAt: isoDateSchema.nullable(),
})

export const accountMigrationNotificationPreferenceSchema = z.object({
  targetType: z.string().min(1).max(64),
  targetId: z.string().min(1).max(128),
  channels: z.record(z.string(), z.unknown()),
  presentation: z.record(z.string(), z.unknown()),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const accountMigrationUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().max(255),
  createdAt: isoDateSchema,
})

export const accountExportSchema = z
  .object({
    format: z.literal(ACCOUNT_EXPORT_FORMAT),
    version: z.literal(ACCOUNT_EXPORT_VERSION),
    exportedAt: isoDateSchema,
    projects: z.array(accountMigrationProjectSchema).max(1_000),
    accountPreferences: accountPreferencesRecordSchema.optional(),
    notificationPreferences: z.array(accountMigrationNotificationPreferenceSchema).max(10_000).optional(),
    user: accountMigrationUserSchema.optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    const seen = new Set<string>()
    for (const [index, project] of value.projects.entries()) {
      if (seen.has(project.id)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate project id.",
          path: ["projects", index, "id"],
        })
      }
      seen.add(project.id)
    }

    const seenPreferences = new Set<string>()
    for (const [index, preference] of (value.notificationPreferences ?? []).entries()) {
      const key = `${preference.targetType}\u0000${preference.targetId}`
      if (seenPreferences.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate notification preference target.",
          path: ["notificationPreferences", index],
        })
      }
      seenPreferences.add(key)
    }
  })

export const accountImportRequestSchema = z.object({
  conflictStrategy: z.enum(["skip", "replace"]).default("skip"),
  export: accountExportSchema,
})

export type AccountMigrationProject = z.infer<typeof accountMigrationProjectSchema>
export type AccountMigrationNotificationPreference = z.infer<typeof accountMigrationNotificationPreferenceSchema>
export type AccountImportRequest = z.infer<typeof accountImportRequestSchema>
export type AccountImportConflictStrategy = AccountImportRequest["conflictStrategy"]

export type ExistingImportProject = ProjectMembership & {
  ownerId: string | null
}

export type AccountImportAction = {
  kind: "create" | "replace"
  project: AccountMigrationProject
  claimedAt: string
  readOnly: boolean
}

export type AccountImportConflict = {
  projectId: string
  reason: "already_exists" | "id_unavailable"
}

export type AccountImportPlan = {
  actions: AccountImportAction[]
  conflicts: AccountImportConflict[]
}

export type AccountImportResult = {
  accountPreferencesImported: boolean
  created: string[]
  replaced: string[]
  conflicts: AccountImportConflict[]
  notificationPreferencesImported: number
  profileImported: boolean
  readOnlyProjectIds: string[]
}

function migrationMembershipDate(project: AccountMigrationProject) {
  return project.claimedAt ?? project.createdAt
}

export function planAccountProjectImport(input: {
  conflictStrategy: AccountImportConflictStrategy
  existingProjects: ExistingImportProject[]
  importedAt: string
  maxProjects: number
  projects: AccountMigrationProject[]
  userId: string
}): AccountImportPlan {
  const existingById = new Map(input.existingProjects.map((project) => [project.id, project]))
  const orderedProjects = [...input.projects].sort((a, b) => {
    const dateComparison = migrationMembershipDate(a).localeCompare(migrationMembershipDate(b))
    return dateComparison || a.id.localeCompare(b.id)
  })
  const actions: AccountImportAction[] = []
  const conflicts: AccountImportConflict[] = []
  const importedBase = new Date(input.importedAt).getTime()

  for (const [index, project] of orderedProjects.entries()) {
    const existing = existingById.get(project.id)
    if (existing) {
      if (existing.ownerId !== input.userId) {
        conflicts.push({ projectId: project.id, reason: "id_unavailable" })
        continue
      }
      if (input.conflictStrategy === "skip") {
        conflicts.push({ projectId: project.id, reason: "already_exists" })
        continue
      }
      actions.push({
        kind: "replace",
        project,
        claimedAt: existing.claimedAt ?? existing.createdAt,
        readOnly: false,
      })
      continue
    }

    actions.push({
      kind: "create",
      project,
      claimedAt: new Date(importedBase + index).toISOString(),
      readOnly: false,
    })
  }

  const memberships: ProjectMembership[] = [
    ...input.existingProjects.filter((project) => project.ownerId === input.userId),
    ...actions
      .filter((action) => action.kind === "create")
      .map((action) => ({
        id: action.project.id,
        claimedAt: action.claimedAt,
        createdAt: action.project.createdAt,
      })),
  ]
  const readOnlyIds = readOnlyProjectIds(memberships, input.maxProjects)

  return {
    actions: actions.map((action) => ({ ...action, readOnly: readOnlyIds.has(action.project.id) })),
    conflicts,
  }
}

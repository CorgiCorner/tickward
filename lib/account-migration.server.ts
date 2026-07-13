import "server-only"

import type { AccountImportRequest, AccountImportResult } from "@/lib/account-migration"
import type { UserActor } from "@/lib/contracts"
import { getEntitlementsForActor } from "@/lib/entitlements.server"
import { getServerAdapters } from "@/lib/server-adapters.server"

export async function importAccountProjects(
  actor: UserActor,
  input: AccountImportRequest,
  importedAt = new Date(),
): Promise<AccountImportResult | null> {
  const repository = getServerAdapters().projectRepository
  if (!repository.importUserProjects) return null
  const entitlements = await getEntitlementsForActor(actor)

  return repository.importUserProjects({
    accountPreferences: input.export.accountPreferences,
    conflictStrategy: input.conflictStrategy,
    importedAt: importedAt.toISOString(),
    maxProjects: entitlements.maxProjects,
    notificationPreferences: input.export.notificationPreferences,
    profileName: input.export.user?.name,
    projects: input.export.projects,
    user: actor.user,
  })
}

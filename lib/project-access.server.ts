import "server-only"

import type { Actor, UserActor, UserRef } from "@/lib/contracts"
import { formatMessage } from "@/lib/i18n/messages"

export type RestoreKeyProjectAccess = {
  kind: "restore_key"
  actor: Actor
  restoreKey: string
  user?: UserRef
}

export type UserProjectAccess = {
  kind: "user_project"
  actor: UserActor
  user: UserRef
  projectId: string
}

export type ClaimProjectAccess = {
  kind: "claim_restore_key"
  actor: UserActor
  user: UserRef
  restoreKey: string
}

export type ProjectAccessContext = RestoreKeyProjectAccess | UserProjectAccess

export function projectAccessFromActor(actor: Actor): RestoreKeyProjectAccess {
  if (actor.kind === "anonymous") {
    return { kind: "restore_key", actor, restoreKey: actor.restoreKey }
  }

  if (actor.restoreKey) {
    return { kind: "restore_key", actor, restoreKey: actor.restoreKey, user: actor.user }
  }

  throw new Error(formatMessage("errors.projectAccessTokenUnavailable"))
}

export function userProjectAccess(actor: UserActor, projectId: string): UserProjectAccess {
  return { kind: "user_project", actor, user: actor.user, projectId }
}

export function claimProjectAccess(actor: Actor, restoreKey: string): ClaimProjectAccess | null {
  if (actor.kind !== "user") return null
  return { kind: "claim_restore_key", actor, user: actor.user, restoreKey }
}

export function restoreKeyForProjectAccess(access: ProjectAccessContext): string {
  if (access.kind === "restore_key") return access.restoreKey
  throw new Error(formatMessage("errors.userProjectIdsUnsupported"))
}

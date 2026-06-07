import type { Actor, UserActor } from "@/lib/contracts"
import { formatMessage } from "@/lib/i18n/messages"

export const USER_ROLES = ["admin", "user"] as const
export type UserRole = (typeof USER_ROLES)[number]

export const PERMISSION_RESOURCES = [
  "project",
  "timer",
  "space",
  "share",
  "pushSubscription",
  "notificationPreference",
] as const
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number]

export const PERMISSION_ACTIONS = ["create", "read", "update", "delete", "claim"] as const
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export type EntityAccessOptions = {
  resource?: PermissionResource
  entityRestoreKey?: string | null
  restoreKeyMatchesActor?: boolean
}

export function actorRole(actor: Actor | null): UserRole | "anonymous" {
  if (!actor || actor.kind === "anonymous") return "anonymous"
  return actor.user.role ?? "user"
}

function isUserActor(actor: Actor | null): actor is UserActor {
  return actor?.kind === "user"
}

function hasMatchingRestoreKey(
  actor: Actor,
  options: Pick<EntityAccessOptions, "entityRestoreKey" | "restoreKeyMatchesActor">,
) {
  if (options.restoreKeyMatchesActor !== undefined) return options.restoreKeyMatchesActor
  const entityRestoreKey = options.entityRestoreKey
  if (!entityRestoreKey) return false
  if (actor.kind === "anonymous") return actor.restoreKey === entityRestoreKey
  return actor.restoreKey === entityRestoreKey
}

function canUserAccess(actor: UserActor, action: PermissionAction, entityOwnerId?: string | null) {
  if (action === "claim") return false
  if (action === "create") return !entityOwnerId || actor.user.id === entityOwnerId
  return actor.user.id === entityOwnerId
}

function canAnonymousAccess(
  action: PermissionAction,
  actor: Actor,
  options: Pick<EntityAccessOptions, "entityRestoreKey" | "restoreKeyMatchesActor">,
) {
  if (action === "claim") return false
  return hasMatchingRestoreKey(actor, options)
}

export function canAccessEntity(
  actor: Actor | null,
  action: PermissionAction,
  entityOwnerId?: string | null,
  options: EntityAccessOptions = {},
): boolean {
  if (!actor) return false
  if (actorRole(actor) === "admin") return true

  if (isUserActor(actor)) {
    if (action === "claim") return hasMatchingRestoreKey(actor, options)
    return canUserAccess(actor, action, entityOwnerId)
  }

  return canAnonymousAccess(action, actor, options)
}

export function assertCanAccessEntity(
  actor: Actor | null,
  action: PermissionAction,
  entityOwnerId?: string | null,
  options: EntityAccessOptions = {},
) {
  if (!canAccessEntity(actor, action, entityOwnerId, options)) {
    const resource = options.resource ?? "project"
    throw new Error(formatMessage("errors.entityAccessDenied", { action, resource }))
  }
}

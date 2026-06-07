import type { Actor } from "@/lib/contracts"
import {
  assertCanAccessEntity,
  canAccessEntity,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/auth/permissions"

export type OwnershipRef = {
  ownerId?: string | null
  restoreKey?: string | null
  restoreKeyMatchesActor?: boolean
}

function accessOptions(resource: PermissionResource, entity: OwnershipRef) {
  return {
    resource,
    entityRestoreKey: entity.restoreKey ?? null,
    restoreKeyMatchesActor: entity.restoreKeyMatchesActor,
  }
}

export function canAccessOwnedEntity(
  actor: Actor | null,
  action: PermissionAction,
  resource: PermissionResource,
  entity: OwnershipRef,
) {
  return canAccessEntity(actor, action, entity.ownerId ?? null, accessOptions(resource, entity))
}

export function assertCanAccessOwnedEntity(
  actor: Actor | null,
  action: PermissionAction,
  resource: PermissionResource,
  entity: OwnershipRef,
) {
  assertCanAccessEntity(actor, action, entity.ownerId ?? null, accessOptions(resource, entity))
}

export function canAccessProject(actor: Actor | null, action: PermissionAction, project: OwnershipRef) {
  return canAccessOwnedEntity(actor, action, "project", project)
}

export function assertCanAccessProject(actor: Actor | null, action: PermissionAction, project: OwnershipRef) {
  assertCanAccessOwnedEntity(actor, action, "project", project)
}

export function canAccessTimer(actor: Actor | null, action: PermissionAction, timer: OwnershipRef) {
  return canAccessOwnedEntity(actor, action, "timer", timer)
}

export function assertCanAccessTimer(actor: Actor | null, action: PermissionAction, timer: OwnershipRef) {
  assertCanAccessOwnedEntity(actor, action, "timer", timer)
}

export function canAccessSpace(actor: Actor | null, action: PermissionAction, space: OwnershipRef) {
  return canAccessOwnedEntity(actor, action, "space", space)
}

export function assertCanAccessSpace(actor: Actor | null, action: PermissionAction, space: OwnershipRef) {
  assertCanAccessOwnedEntity(actor, action, "space", space)
}

export function canAccessShare(actor: Actor | null, action: PermissionAction, share: OwnershipRef) {
  return canAccessOwnedEntity(actor, action, "share", share)
}

export function assertCanAccessShare(actor: Actor | null, action: PermissionAction, share: OwnershipRef) {
  assertCanAccessOwnedEntity(actor, action, "share", share)
}

export function canAccessPushSubscription(actor: Actor | null, action: PermissionAction, subscription: OwnershipRef) {
  return canAccessOwnedEntity(actor, action, "pushSubscription", subscription)
}

export function assertCanAccessPushSubscription(
  actor: Actor | null,
  action: PermissionAction,
  subscription: OwnershipRef,
) {
  assertCanAccessOwnedEntity(actor, action, "pushSubscription", subscription)
}

export function canAccessNotificationPreference(
  actor: Actor | null,
  action: PermissionAction,
  preference: OwnershipRef,
) {
  return canAccessOwnedEntity(actor, action, "notificationPreference", preference)
}

export function assertCanAccessNotificationPreference(
  actor: Actor | null,
  action: PermissionAction,
  preference: OwnershipRef,
) {
  assertCanAccessOwnedEntity(actor, action, "notificationPreference", preference)
}

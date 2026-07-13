// v0.2 domain contracts.
//
// These types are the stable vocabulary for the v0.2 architecture (services,
// repositories, future auth/entitlements). They alias the existing model
// shapes so adopting them is a no-op; later versions evolve the contracts and
// swap storage adapters underneath without touching callers.
//
// Wire-format note: timers serialize `targetDate` (ISO string) plus
// `timezone`. The contracts keep those public field names stable across storage
// implementations.

import type { ProjectMeta, ProjectSnapshotV2 } from "@/lib/project-model"
import type { ShareRecord, SharedTimerSnapshot } from "@/lib/share-model"
import type { UserRole } from "@/lib/auth/permissions"

/**
 * Who is performing an operation. Today every caller is anonymous and is
 * identified solely by a restore key; a future authenticated actor kind will
 * extend this union without changing service signatures.
 *
 * With the actor abstraction, the restore key is demoted to an anonymous
 * project access token, not an identity model. Once Better Auth lands,
 * `getCurrentActor` resolves a user session first and falls back to anonymous
 * only when no session is present.
 */
export type AnonymousActor = {
  kind: "anonymous"
  // Anonymous project access token, not an identity. Storage stays keyed by
  // this value as an implementation detail.
  restoreKey: string
}

export type UserActor = {
  kind: "user"
  user: UserRef
  // Optional anonymous project access token supplied when a signed-in user is
  // claiming an existing project.
  restoreKey?: string
}

export type Actor = AnonymousActor | UserActor

export type UserRef = {
  id: string
  email?: string
  role?: UserRole
}

export type Project = ProjectSnapshotV2
export type ProjectRef = ProjectMeta

export type { Space, Timer } from "@/lib/types"

export type Share = ShareRecord
export type SharedTimer = SharedTimerSnapshot

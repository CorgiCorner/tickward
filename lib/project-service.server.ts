import "server-only"

import type { Actor } from "@/lib/contracts"
import {
  claimProjectAccess,
  projectAccessFromActor,
  restoreKeyForProjectAccess,
  userProjectAccess,
} from "@/lib/project-access.server"
import { getEntitlements } from "@/lib/entitlements"
import { isProjectReadOnly } from "@/lib/project-lock"
import type { ProjectRestoreResponse, ProjectSnapshotV2, UserProjectSummary } from "@/lib/project-model"
import type { ClaimedProject } from "@/lib/repositories"
import { getServerAdapters } from "@/lib/server-adapters.server"

export type SaveProjectInput = {
  actor: Actor
  project: ProjectSnapshotV2
  baseUpdatedAt: string | null
  force: boolean
}

export type SaveProjectResult =
  | { status: "saved"; project: ProjectSnapshotV2 }
  | { status: "conflict"; project: ProjectSnapshotV2; source: "project" | "legacy" }
  | { status: "not_found" }
  | { status: "read_only" }

export type ClaimProjectInput = {
  actor: Actor
  restoreKey: string
  claimedAt?: string
}

export type ClaimProjectResult =
  | { status: "claimed"; project: ClaimedProject; overLimit?: boolean }
  | { status: "unauthenticated" }
  | { status: "unsupported" }
  | { status: "not_found" }

export type UserProjectResult<T> =
  | { status: "ok"; data: T }
  | { status: "unauthenticated" }
  | { status: "unsupported" }
  | { status: "not_found" }

export async function loadProject(actor: Actor): Promise<ProjectRestoreResponse | null> {
  const repository = getServerAdapters().projectRepository
  const access = projectAccessFromActor(actor)

  // Delegates unchanged: reads only project:<key> (the legacy-key dual-read
  // was removed in v0.2.0) and keeps the read-time TTL refresh side effect.
  // Repositories stay keyed by restore key — that is a storage detail, not an
  // identity model.
  return repository.loadSnapshot(restoreKeyForProjectAccess(access))
}

export async function loadUserProject(
  actor: Actor,
  projectId: string,
): Promise<UserProjectResult<ProjectRestoreResponse>> {
  if (actor.kind !== "user") return { status: "unauthenticated" }

  const access = userProjectAccess(actor, projectId)
  const repository = getServerAdapters().projectRepository
  if (!repository.loadUserProject) return { status: "unsupported" }

  const project = await repository.loadUserProject({ projectId: access.projectId, user: access.user })
  if (!project) return { status: "not_found" }
  return { status: "ok", data: project }
}

export async function listUserProjects(actor: Actor): Promise<UserProjectResult<UserProjectSummary[]>> {
  if (actor.kind !== "user") return { status: "unauthenticated" }

  const repository = getServerAdapters().projectRepository
  if (!repository.listUserProjects) return { status: "unsupported" }

  return { status: "ok", data: await repository.listUserProjects({ user: actor.user }) }
}

export async function saveProject(input: SaveProjectInput): Promise<SaveProjectResult> {
  const access = projectAccessFromActor(input.actor)
  const restoreKey = restoreKeyForProjectAccess(access)
  const repository = getServerAdapters().projectRepository
  const current = await repository.loadSnapshot(restoreKey)

  if (
    !input.force &&
    current?.project.updatedAt &&
    current.project.updatedAt !== input.project.updatedAt &&
    (!input.baseUpdatedAt || current.project.updatedAt !== input.baseUpdatedAt)
  ) {
    return { status: "conflict", project: current.project, source: current.source }
  }

  const saved = await repository.saveSnapshot(restoreKey, input.project)
  if (!saved) return { status: "not_found" }

  return { status: "saved", project: input.project }
}

export async function saveUserProject(
  actor: Actor,
  projectId: string,
  input: Omit<SaveProjectInput, "actor">,
): Promise<UserProjectResult<SaveProjectResult>> {
  if (actor.kind !== "user") return { status: "unauthenticated" }

  const access = userProjectAccess(actor, projectId)
  const repository = getServerAdapters().projectRepository
  if (!repository.loadUserProject || !repository.saveUserProject) return { status: "unsupported" }

  const current = await repository.loadUserProject({ projectId: access.projectId, user: access.user })
  if (!current) return { status: "not_found" }

  // Read-only check: when the project has an owner and the repo supports membership
  // listing, block writes if this project is over-limit. Fail-open when the method
  // is absent (public mirror adapters may not implement it).
  if (current.ownerId && repository.listProjectMemberships) {
    const memberships = await repository.listProjectMemberships({ ownerId: current.ownerId })
    if (isProjectReadOnly(memberships, access.projectId, getEntitlements().maxProjects)) {
      return { status: "ok", data: { status: "read_only" } }
    }
  }

  if (
    !input.force &&
    current.project.updatedAt &&
    current.project.updatedAt !== input.project.updatedAt &&
    (!input.baseUpdatedAt || current.project.updatedAt !== input.baseUpdatedAt)
  ) {
    return { status: "ok", data: { status: "conflict", project: current.project, source: current.source } }
  }

  const saved = await repository.saveUserProject({
    projectId: access.projectId,
    user: access.user,
    project: input.project,
  })
  if (!saved) return { status: "not_found" }

  return { status: "ok", data: { status: "saved", project: input.project } }
}

export async function clearProject(actor: Actor) {
  const access = projectAccessFromActor(actor)
  await getServerAdapters().projectRepository.clear(restoreKeyForProjectAccess(access))
}

export async function clearUserProject(actor: Actor, projectId: string): Promise<UserProjectResult<true>> {
  if (actor.kind !== "user") return { status: "unauthenticated" }

  const access = userProjectAccess(actor, projectId)
  const repository = getServerAdapters().projectRepository
  if (!repository.clearUserProject) return { status: "unsupported" }

  const cleared = await repository.clearUserProject({ projectId: access.projectId, user: access.user })
  if (!cleared) return { status: "not_found" }
  return { status: "ok", data: true }
}

export async function claimProject(input: ClaimProjectInput): Promise<ClaimProjectResult> {
  const access = claimProjectAccess(input.actor, input.restoreKey)
  if (!access) return { status: "unauthenticated" }

  const repository = getServerAdapters().projectRepository
  if (!repository.claimAnonymousProject) return { status: "unsupported" }

  const project = await repository.claimAnonymousProject({
    restoreKey: access.restoreKey,
    user: access.user,
    claimedAt: input.claimedAt ?? new Date().toISOString(),
  })

  if (!project) return { status: "not_found" }

  // Compute whether the newly claimed project is over the account limit.
  // The claim always succeeds — this is purely informational for the client.
  let overLimit = false
  if (repository.listProjectMemberships) {
    const memberships = await repository.listProjectMemberships({ ownerId: project.owner.id })
    overLimit = isProjectReadOnly(memberships, project.projectId, getEntitlements().maxProjects)
  }

  return { status: "claimed", project, ...(overLimit ? { overLimit: true } : {}) }
}

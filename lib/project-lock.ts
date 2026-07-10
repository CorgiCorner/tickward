import { getEntitlements } from "@/lib/entitlements"
import type { ProjectMeta } from "@/lib/project-model"
import type { TimerStore } from "@/lib/stores/timer-store-types"

export type ProjectMembership = {
  id: string
  claimedAt?: string | null
  createdAt: string
}

/** Returns the effective membership date: claimedAt if present, otherwise createdAt */
export function projectMembershipDate(m: ProjectMembership): string {
  return m.claimedAt ?? m.createdAt
}

/** Comparator: ascending by membership date, then by id (plain string compare) */
export function compareProjectMembership(a: ProjectMembership, b: ProjectMembership): number {
  const dateA = projectMembershipDate(a)
  const dateB = projectMembershipDate(b)
  if (dateA !== dateB) return dateA < dateB ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Returns the set of project ids that are read-only (over-limit).
 * Projects are sorted ascending by membership date (claimedAt ?? createdAt, tie-break by id).
 * The first maxProjects are editable; the remainder are read-only.
 * If memberships.length <= maxProjects, returns an empty set.
 */
export function readOnlyProjectIds(memberships: ProjectMembership[], maxProjects: number): Set<string> {
  if (memberships.length <= maxProjects) return new Set()
  const sorted = [...memberships].sort(compareProjectMembership)
  return new Set(sorted.slice(maxProjects).map((m) => m.id))
}

/** Returns true if projectId is in the read-only (over-limit) set */
export function isProjectReadOnly(memberships: ProjectMembership[], projectId: string, maxProjects: number): boolean {
  return readOnlyProjectIds(memberships, maxProjects).has(projectId)
}

/**
 * Extracts ProjectMembership entries from a ProjectMeta array.
 * Only account projects (those with a cloudProjectId) are included;
 * the membership id is the cloudProjectId (the server-side project id).
 * Local-only projects are never read-only and are excluded.
 */
export function accountProjectMemberships(projects: ProjectMeta[]): ProjectMembership[] {
  return projects.flatMap((p) =>
    p.cloudProjectId ? [{ id: p.cloudProjectId, claimedAt: p.claimedAt ?? null, createdAt: p.createdAt }] : [],
  )
}

/**
 * Returns true if the currently active project in the store state is read-only
 * (i.e. the account has more projects than the current plan allows).
 * Local-only projects (no cloudProjectId) are never read-only.
 */
export function isActiveProjectReadOnly(state: Pick<TimerStore, "activeProjectId" | "projects">): boolean {
  const activeId = state.activeProjectId
  if (!activeId) return false
  const active = state.projects.find((p) => p.id === activeId)
  if (!active?.cloudProjectId) return false
  const memberships = accountProjectMemberships(state.projects)
  const max = getEntitlements().maxProjects
  return isProjectReadOnly(memberships, active.cloudProjectId, max)
}

import type { ProjectRestoreResponse, ProjectSnapshotV2, UserProjectSummary } from "@/lib/project-model"
import { publicClientErrorFromResponse } from "@/lib/public-errors"
import type { ClaimedProject } from "@/lib/repositories"

export type SaveProjectArgs = {
  key?: string
  projectId?: string
  project: ProjectSnapshotV2
  baseUpdatedAt: string | undefined
  force: boolean
}

export type SaveProjectResult =
  | { status: "saved" }
  | { status: "conflict"; project?: ProjectSnapshotV2; source: "project" | "legacy" }
  | { status: "not_found" }

export type RestoreProjectResult =
  | { status: "ok"; data: ProjectRestoreResponse }
  | { status: "unauthenticated" }
  | { status: "unsupported" }
  | { status: "not_found" }

export type ClaimProjectResult =
  | { status: "claimed"; project: ClaimedProject; overLimit?: boolean }
  | { status: "unauthenticated" }
  | { status: "unsupported" }
  | { status: "not_found" }

export type ListUserProjectsResult =
  | { status: "ok"; projects: UserProjectSummary[] }
  | { status: "unauthenticated" }
  | { status: "unsupported" }
  | { status: "not_found" }

export type ReorderUserProjectsResult = { status: "ok" } | { status: "unauthenticated" } | { status: "unsupported" }

/**
 * POST /api/projects/save. Mirrors the store's exact interpretation:
 * - 409 -> conflict with optional remote project + source (default "project")
 * - non-ok -> throws PublicClientError
 * - ok -> saved
 */
export async function saveProject({
  key,
  projectId,
  project,
  baseUpdatedAt,
  force,
}: SaveProjectArgs): Promise<SaveProjectResult> {
  const res = await fetch("/api/projects/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key,
      projectId,
      project,
      baseUpdatedAt: force ? undefined : baseUpdatedAt,
      force,
    }),
  })

  if (res.status === 409) {
    const data = (await res.json()) as { project?: ProjectSnapshotV2; source?: "project" | "legacy" }
    return { status: "conflict", project: data.project, source: data.source ?? "project" }
  }

  if (res.status === 404) return { status: "not_found" }
  if (res.status === 401) throw await publicClientErrorFromResponse(res, "errors.signInRequired")
  if (res.status === 501) throw await publicClientErrorFromResponse(res, "errors.claimUnsupported")
  if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.saveFailed")

  return { status: "saved" }
}

/**
 * GET /api/projects/restore?key=. Mirrors the store's exact interpretation:
 * - 404 -> not_found
 * - non-ok -> throws PublicClientError
 * - ok -> parsed ProjectRestoreResponse
 */
export async function restoreProject(key: string): Promise<RestoreProjectResult> {
  const res = await fetch(`/api/projects/restore?key=${encodeURIComponent(key)}`, {
    method: "GET",
    cache: "no-store",
  })

  if (res.status === 404) return { status: "not_found" }
  if (res.status === 401) return { status: "unauthenticated" }
  if (res.status === 501) return { status: "unsupported" }
  if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.restoreFailed")

  const data = (await res.json()) as ProjectRestoreResponse
  return { status: "ok", data }
}

export async function restoreUserProject(projectId: string): Promise<RestoreProjectResult> {
  const res = await fetch(`/api/projects/restore?projectId=${encodeURIComponent(projectId)}`, {
    method: "GET",
    cache: "no-store",
  })

  if (res.status === 404) return { status: "not_found" }
  if (res.status === 401) return { status: "unauthenticated" }
  if (res.status === 501) return { status: "unsupported" }
  if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.restoreFailed")

  const data = (await res.json()) as ProjectRestoreResponse
  return { status: "ok", data }
}

export async function listUserProjects(): Promise<ListUserProjectsResult> {
  const res = await fetch("/api/projects/list", {
    method: "GET",
    cache: "no-store",
  })

  if (res.status === 401) return { status: "unauthenticated" }
  if (res.status === 501) return { status: "unsupported" }
  if (res.status === 404) return { status: "not_found" }
  if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.restoreFailed")

  const data = (await res.json()) as { projects?: UserProjectSummary[] }
  return { status: "ok", projects: Array.isArray(data.projects) ? data.projects : [] }
}

export async function reorderUserProjects(projectIds: string[]): Promise<ReorderUserProjectsResult> {
  const res = await fetch("/api/projects/reorder", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectIds }),
  })
  if (res.status === 401) return { status: "unauthenticated" }
  if (res.status === 501) return { status: "unsupported" }
  if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.saveFailed")
  return { status: "ok" }
}

/**
 * DELETE /api/projects/clear?key=. Mirrors the store's exact interpretation:
 * - non-ok -> throws PublicClientError
 */
export async function clearProject(key: string): Promise<void> {
  const res = await fetch(`/api/projects/clear?key=${encodeURIComponent(key)}`, { method: "DELETE" })
  if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.deleteFailed")
}

export async function clearUserProject(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/clear?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" })
  if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.deleteFailed")
}

export async function claimProject(key: string): Promise<ClaimProjectResult> {
  const res = await fetch("/api/projects/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ restoreKey: key }),
  })

  if (res.status === 401) return { status: "unauthenticated" }
  if (res.status === 501) return { status: "unsupported" }
  if (res.status === 404) return { status: "not_found" }
  if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.claimFailed")

  const data = (await res.json()) as { project: ClaimedProject & { overLimit?: boolean } }
  return { status: "claimed", project: data.project, overLimit: data.project.overLimit === true }
}

export type ProjectCloudClient = {
  saveProject: typeof saveProject
  restoreProject: typeof restoreProject
  restoreUserProject: typeof restoreUserProject
  listUserProjects: typeof listUserProjects
  reorderUserProjects: typeof reorderUserProjects
  clearProject: typeof clearProject
  clearUserProject: typeof clearUserProject
  claimProject: typeof claimProject
}

export const projectCloudClient: ProjectCloudClient = {
  saveProject,
  restoreProject,
  restoreUserProject,
  listUserProjects,
  reorderUserProjects,
  clearProject,
  clearUserProject,
  claimProject,
}

// v0.2 repository ports.
//
// Services depend on these interfaces instead of concrete storage so persistence
// details stay out of domain and API code.
// This module is type-only and safe to import anywhere; the concrete adapters
// live in `*-repository.server.ts` modules.

import type { ProjectRestoreResponse, ProjectSnapshotV2, UserProjectSummary } from "@/lib/project-model"
import type { ResolvedShare, ShareRecord } from "@/lib/share-model"
import type { UserRef } from "@/lib/contracts"

export type ClaimedProject = {
  projectId: string
  project: ProjectSnapshotV2
  owner: UserRef
  claimedAt: string
}

export interface ProjectRepository {
  loadSnapshot(restoreKey: string): Promise<ProjectRestoreResponse | null>
  saveSnapshot(restoreKey: string, project: ProjectSnapshotV2): Promise<boolean>
  clear(restoreKey: string): Promise<void>
  claimAnonymousProject?(args: { restoreKey: string; user: UserRef; claimedAt: string }): Promise<ClaimedProject | null>
  listUserProjects?(args: { user: UserRef }): Promise<UserProjectSummary[]>
  loadUserProject?(args: { projectId: string; user: UserRef }): Promise<ProjectRestoreResponse | null>
  saveUserProject?(args: { projectId: string; user: UserRef; project: ProjectSnapshotV2 }): Promise<boolean>
  clearUserProject?(args: { projectId: string; user: UserRef }): Promise<boolean>
}

export interface ShareRepository {
  publishTimer(args: { shareId: string; timerId: string; sharedAt: string; access: TimerShareAccess }): Promise<boolean>
  // Lightweight read of a shareable timer's link, used to gate anonymous shares.
  findTimerForShare(args: { timerId: string; access: TimerShareAccess }): Promise<{ url: string | null } | null>
  hasPublishedTimer(args: { shareId: string; timerId: string; access: TimerShareAccess }): Promise<boolean>
  findPublishedTimer(args: { timerId: string; access: TimerShareAccess }): Promise<ShareRecordWithId | null>
  load(shareId: string): Promise<ShareRecord | null>
  resolve(shareId: string): Promise<ResolvedShare | null>
  resolveBatch(shareIds: string[]): Promise<Map<string, ResolvedShare | null>>
}

export type ShareRecordWithId = ShareRecord & {
  shareId: string
}

export type TimerShareAccess =
  | { kind: "restore-key"; restoreKey: string }
  | { kind: "user-project"; projectId: string; user: UserRef }

export type RateLimitBucket =
  | "write"
  | "share-create"
  | "clear"
  | "embed-state"
  | "embed-seen"
  | "auth-otp"
  | "auth-otp-ip"
  | "public-api"
  | "public-api-ip"
  | "api-key-management"
  | "webhook-management"
  | "webhook-test"
  | "mcp-connection-management"
  | "mcp-oauth-exchange"
  | "mcp-oauth-grant"

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; retryAfter: number; limit: number; remaining: number; reset: number }

export interface RateLimitRepository {
  check(bucket: RateLimitBucket, key: string): Promise<RateLimitDecision>
}

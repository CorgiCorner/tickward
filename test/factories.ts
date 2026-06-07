import type { ProjectSnapshotV2 } from "@/lib/project-model"
import { PROJECT_SNAPSHOT_VERSION } from "@/lib/project-model"
import type { Space, Timer } from "@/lib/types"

export const FIXED_NOW = "2026-05-24T00:00:00.000Z"

export function makeTimer(overrides: Partial<Timer> = {}): Timer {
  return {
    id: "timer-a",
    label: "Launch",
    targetDate: "2026-05-25T12:00:00.000Z",
    timezone: "Europe/Warsaw",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    ...overrides,
  }
}

export function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: "space-a",
    name: "Work",
    createdAt: "2026-05-20T00:00:00.000Z",
    ...overrides,
  }
}

export function makeProjectSnapshot(overrides: Partial<ProjectSnapshotV2> = {}): ProjectSnapshotV2 {
  return {
    version: PROJECT_SNAPSHOT_VERSION,
    name: "Project Alpha",
    timers: [makeTimer()],
    spaces: [],
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  }
}

export function jsonRequest(url: string, body: unknown, init: RequestInit = {}) {
  return new Request(url, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: JSON.stringify(body),
    ...init,
  })
}

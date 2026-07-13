"use client"

import { describe, expect, it } from "vitest"

import {
  TD_ACTIVE_PROJECT_STORAGE_KEY,
  TD_PROJECTS_STORAGE_KEY,
  projectPayloadStorageKey,
  readActiveProjectId,
  readProjectPayload,
  readProjectRegistry,
  removeProjectPayload,
  writeActiveProjectId,
  writeProjectPayload,
  writeProjectRegistry,
} from "@/lib/project-storage.client"
import { getEntitlements } from "@/lib/entitlements"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { makeSpace, makeTimer } from "@/test/factories"

function makeAccountEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: `project-acc-${Math.random().toString(36).slice(2)}`,
    name: "Account project",
    restoreKey: `restoreKey_${Math.random().toString(36).slice(2)}`,
    cloudProjectId: `project_${Math.random().toString(36).slice(2)}`,
    ownerId: "user_123",
    claimedAt: "2026-05-20T00:00:00.000Z",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    hasUnsyncedChanges: false,
    ...overrides,
  }
}

function makeLocalEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: `project-local-${Math.random().toString(36).slice(2)}`,
    name: "Local project",
    restoreKey: `restoreKey_${Math.random().toString(36).slice(2)}`,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    hasUnsyncedChanges: false,
    ...overrides,
  }
}

describe("local project storage", () => {
  it("round-trips project registry and dedupes duplicate restore keys", () => {
    writeProjectRegistry([
      {
        id: "project-a",
        name: "Alpha",
        restoreKey: "restoreKey_123",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:00.000Z",
        hasUnsyncedChanges: true,
      },
      {
        id: "project-b",
        name: "Duplicate",
        restoreKey: "restoreKey_123",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ])

    expect(readProjectRegistry()).toEqual([
      expect.objectContaining({
        id: "project-a",
        name: "Alpha",
        restoreKey: "restoreKey_123",
        hasUnsyncedChanges: true,
      }),
    ])
  })

  it("ignores invalid registry JSON and invalid project records", () => {
    localStorage.setItem(TD_PROJECTS_STORAGE_KEY, "{bad")
    expect(readProjectRegistry()).toEqual([])

    localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify([{ id: "project-a" }]))
    expect(readProjectRegistry()).toEqual([])
  })

  it("round-trips active project id", () => {
    writeActiveProjectId("project-a")
    expect(readActiveProjectId()).toBe("project-a")
    expect(localStorage.getItem(TD_ACTIVE_PROJECT_STORAGE_KEY)).toBe("project-a")

    writeActiveProjectId(null)
    expect(readActiveProjectId()).toBeNull()
  })

  it("round-trips and sanitizes project payloads", () => {
    writeProjectPayload("project-a", {
      timers: [makeTimer({ id: "timer-a" })],
      spaces: [makeSpace({ id: "space-a" })],
      activeSpaceId: "space-a",
      updatedAt: "2026-05-24T00:00:00.000Z",
    })

    expect(readProjectPayload("project-a")).toEqual({
      timers: [expect.objectContaining({ id: "timer-a" })],
      spaces: [expect.objectContaining({ id: "space-a" })],
      activeSpaceId: "space-a",
      sortMode: "soonest",
      timerFilters: { type: "all", pinned: false, muted: false, shared: false, recurring: false },
      updatedAt: "2026-05-24T00:00:00.000Z",
    })

    localStorage.setItem(
      projectPayloadStorageKey("project-b"),
      JSON.stringify({
        timers: [makeTimer({ id: "timer-b" })],
        spaces: [makeSpace({ id: "space-b" })],
        activeSpaceId: "missing-space",
        sortMode: "unknown",
        timerFilters: { notifications: true, shared: true },
      }),
    )

    expect(readProjectPayload("project-b")).toEqual(
      expect.objectContaining({
        timers: [expect.objectContaining({ id: "timer-b" })],
        activeSpaceId: null,
        sortMode: "soonest",
        timerFilters: { type: "all", pinned: false, muted: false, shared: true, recurring: false },
      }),
    )
  })

  it("preserves local organizer preferences", () => {
    writeProjectPayload("project-a", {
      timers: [makeTimer({ id: "timer-a" })],
      spaces: [makeSpace({ id: "space-a" })],
      activeSpaceId: UNASSIGNED_SPACE_ID,
      sortMode: "soonest",
      timerFilters: { type: "countdown", pinned: false, muted: true, shared: true, recurring: false },
      updatedAt: "2026-05-24T00:00:00.000Z",
    })

    expect(readProjectPayload("project-a")).toEqual(
      expect.objectContaining({
        activeSpaceId: UNASSIGNED_SPACE_ID,
        sortMode: "soonest",
        timerFilters: { type: "countdown", pinned: false, muted: true, shared: true, recurring: false },
      }),
    )
  })

  it("treats timers from missing spaces as unassigned", () => {
    localStorage.setItem(
      projectPayloadStorageKey("project-orphan-space"),
      JSON.stringify({
        timers: [
          makeTimer({ id: "timer-visible", spaceId: "space-a" }),
          makeTimer({ id: "timer-orphan", spaceId: "space-missing" }),
        ],
        spaces: [makeSpace({ id: "space-a" })],
        activeSpaceId: null,
      }),
    )

    expect(readProjectPayload("project-orphan-space")?.timers).toEqual([
      expect.objectContaining({ id: "timer-visible", spaceId: "space-a" }),
      expect.objectContaining({ id: "timer-orphan", spaceId: undefined }),
    ])
  })

  it("removes project payloads", () => {
    writeProjectPayload("project-a", {
      timers: [],
      spaces: [],
      activeSpaceId: null,
      updatedAt: "2026-05-24T00:00:00.000Z",
    })
    removeProjectPayload("project-a")

    expect(readProjectPayload("project-a")).toBeNull()
  })

  it("readProjectRegistry keeps more than MAX_PROJECTS account metas (no slice on account entries)", () => {
    // Account metas mirror the server list and must never be capped by the
    // device registry read; only local entries are bounded.
    const maxProjects = getEntitlements().maxProjects
    const entries = Array.from({ length: maxProjects + 2 }, () => makeAccountEntry())
    localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify(entries))

    const registry = readProjectRegistry()

    expect(registry).toHaveLength(maxProjects + 2)
    expect(registry.every((p) => p.cloudProjectId !== undefined)).toBe(true)
  })

  it("pathological all-local registry is still capped at MAX_PROJECTS", () => {
    // Write MAX_PROJECTS+2 purely local projects — cap must still apply after fix.
    // Before fix: the global slice already caps, so this would pass, BUT the fix
    // changes the logic to only cap locals — this verifies the cap is preserved.
    const maxProjects = getEntitlements().maxProjects
    const entries = Array.from({ length: maxProjects + 2 }, () => makeLocalEntry())
    localStorage.setItem(TD_PROJECTS_STORAGE_KEY, JSON.stringify(entries))

    const registry = readProjectRegistry()

    expect(registry).toHaveLength(maxProjects)
  })
})

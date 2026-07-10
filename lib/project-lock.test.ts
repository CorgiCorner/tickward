import { describe, expect, it } from "vitest"

import {
  accountProjectMemberships,
  compareProjectMembership,
  isProjectReadOnly,
  projectMembershipDate,
  readOnlyProjectIds,
  type ProjectMembership,
} from "@/lib/project-lock"
import type { ProjectMeta } from "@/lib/project-model"

function makeMembership(overrides: Partial<ProjectMembership> & { id: string }): ProjectMembership {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("projectMembershipDate", () => {
  it("returns claimedAt when present", () => {
    const m = makeMembership({ id: "a", claimedAt: "2026-06-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" })
    expect(projectMembershipDate(m)).toBe("2026-06-01T00:00:00.000Z")
  })

  it("falls back to createdAt when claimedAt is absent", () => {
    const m = makeMembership({ id: "a", createdAt: "2026-03-15T00:00:00.000Z" })
    expect(projectMembershipDate(m)).toBe("2026-03-15T00:00:00.000Z")
  })

  it("falls back to createdAt when claimedAt is null", () => {
    const m = makeMembership({ id: "a", claimedAt: null, createdAt: "2026-03-15T00:00:00.000Z" })
    expect(projectMembershipDate(m)).toBe("2026-03-15T00:00:00.000Z")
  })
})

describe("compareProjectMembership", () => {
  it("sorts earlier date before later date", () => {
    const a = makeMembership({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" })
    const b = makeMembership({ id: "b", createdAt: "2026-06-01T00:00:00.000Z" })
    expect(compareProjectMembership(a, b)).toBeLessThan(0)
    expect(compareProjectMembership(b, a)).toBeGreaterThan(0)
  })

  it("uses id as tie-break when dates are equal", () => {
    const a = makeMembership({ id: "aaa", createdAt: "2026-01-01T00:00:00.000Z" })
    const b = makeMembership({ id: "zzz", createdAt: "2026-01-01T00:00:00.000Z" })
    expect(compareProjectMembership(a, b)).toBeLessThan(0)
    expect(compareProjectMembership(b, a)).toBeGreaterThan(0)
  })

  it("returns 0 for identical id and date", () => {
    const a = makeMembership({ id: "x", createdAt: "2026-01-01T00:00:00.000Z" })
    expect(compareProjectMembership(a, a)).toBe(0)
  })
})

describe("readOnlyProjectIds", () => {
  it("returns empty set when count is exactly at the limit", () => {
    const memberships = [
      makeMembership({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeMembership({ id: "b", createdAt: "2026-02-01T00:00:00.000Z" }),
    ]
    expect(readOnlyProjectIds(memberships, 2).size).toBe(0)
  })

  it("returns empty set when count is below the limit", () => {
    const memberships = [makeMembership({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" })]
    expect(readOnlyProjectIds(memberships, 2).size).toBe(0)
  })

  it("marks the newest project read-only when one over limit", () => {
    const memberships = [
      makeMembership({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeMembership({ id: "middle", createdAt: "2026-04-01T00:00:00.000Z" }),
      makeMembership({ id: "newest", createdAt: "2026-07-01T00:00:00.000Z" }),
    ]
    const readOnly = readOnlyProjectIds(memberships, 2)
    expect(readOnly.has("newest")).toBe(true)
    expect(readOnly.has("older")).toBe(false)
    expect(readOnly.has("middle")).toBe(false)
    expect(readOnly.size).toBe(1)
  })

  it("marks multiple newest projects read-only when several over limit", () => {
    const memberships = [
      makeMembership({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeMembership({ id: "p2", createdAt: "2026-02-01T00:00:00.000Z" }),
      makeMembership({ id: "p3", createdAt: "2026-03-01T00:00:00.000Z" }),
      makeMembership({ id: "p4", createdAt: "2026-04-01T00:00:00.000Z" }),
    ]
    const readOnly = readOnlyProjectIds(memberships, 2)
    expect(readOnly.has("p1")).toBe(false)
    expect(readOnly.has("p2")).toBe(false)
    expect(readOnly.has("p3")).toBe(true)
    expect(readOnly.has("p4")).toBe(true)
  })

  it("recomputes correctly after a member is removed", () => {
    const memberships = [
      makeMembership({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeMembership({ id: "p2", createdAt: "2026-02-01T00:00:00.000Z" }),
      makeMembership({ id: "p3", createdAt: "2026-03-01T00:00:00.000Z" }),
    ]
    const readOnlyBefore = readOnlyProjectIds(memberships, 2)
    expect(readOnlyBefore.has("p3")).toBe(true)

    // Remove the read-only project
    const remaining = memberships.filter((m) => m.id !== "p3")
    const readOnlyAfter = readOnlyProjectIds(remaining, 2)
    expect(readOnlyAfter.size).toBe(0)
  })
})

describe("isProjectReadOnly", () => {
  it("returns false for an editable project", () => {
    const memberships = [
      makeMembership({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeMembership({ id: "b", createdAt: "2026-02-01T00:00:00.000Z" }),
    ]
    expect(isProjectReadOnly(memberships, "a", 2)).toBe(false)
  })

  it("returns true for an over-limit project", () => {
    const memberships = [
      makeMembership({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeMembership({ id: "b", createdAt: "2026-02-01T00:00:00.000Z" }),
      makeMembership({ id: "c", createdAt: "2026-03-01T00:00:00.000Z" }),
    ]
    expect(isProjectReadOnly(memberships, "c", 2)).toBe(true)
  })
})

describe("accountProjectMemberships", () => {
  it("excludes local projects without cloudProjectId", () => {
    const projects: ProjectMeta[] = [
      {
        id: "local-1",
        name: "Local",
        restoreKey: "key_local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    expect(accountProjectMemberships(projects)).toHaveLength(0)
  })

  it("includes account projects and maps cloudProjectId as membership id", () => {
    const projects: ProjectMeta[] = [
      {
        id: "local-acc",
        name: "Account",
        restoreKey: "key_acc",
        cloudProjectId: "cloud_abc",
        claimedAt: "2026-06-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    const memberships = accountProjectMemberships(projects)
    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.id).toBe("cloud_abc")
    expect(memberships[0]?.claimedAt).toBe("2026-06-01T00:00:00.000Z")
    expect(memberships[0]?.createdAt).toBe("2026-01-01T00:00:00.000Z")
  })
})

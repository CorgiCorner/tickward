import { describe, expect, it } from "vitest"

import type { Actor, UserActor } from "@/lib/contracts"
import {
  claimProjectAccess,
  projectAccessFromActor,
  restoreKeyForProjectAccess,
  userProjectAccess,
} from "@/lib/project-access.server"

describe("project access context", () => {
  it("maps anonymous actors to restore-key access", () => {
    const actor: Actor = { kind: "anonymous", restoreKey: "restoreKey_123" }

    const access = projectAccessFromActor(actor)

    expect(access).toEqual({ kind: "restore_key", actor, restoreKey: "restoreKey_123" })
    expect(restoreKeyForProjectAccess(access)).toBe("restoreKey_123")
  })

  it("maps signed-in actors with a restore key to claim-compatible restore-key access", () => {
    const actor: UserActor = { kind: "user", user: { id: "user_123" }, restoreKey: "restoreKey_123" }

    expect(projectAccessFromActor(actor)).toEqual({
      kind: "restore_key",
      actor,
      restoreKey: "restoreKey_123",
      user: { id: "user_123" },
    })
    expect(claimProjectAccess(actor, "restoreKey_123")).toEqual({
      kind: "claim_restore_key",
      actor,
      user: { id: "user_123" },
      restoreKey: "restoreKey_123",
    })
  })

  it("keeps future user-project IDs separate from restore-key repositories", () => {
    const actor: UserActor = { kind: "user", user: { id: "user_123" } }
    const access = userProjectAccess(actor, "project_123")

    expect(access).toEqual({
      kind: "user_project",
      actor,
      user: { id: "user_123" },
      projectId: "project_123",
    })
    expect(() => restoreKeyForProjectAccess(access)).toThrow(
      "Project repository does not support user project IDs yet.",
    )
    expect(() => projectAccessFromActor(actor)).toThrow("Project access token unavailable.")
  })
})

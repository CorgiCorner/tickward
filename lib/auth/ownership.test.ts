import { describe, expect, it } from "vitest"

import type { Actor } from "@/lib/contracts"
import {
  assertCanAccessShare,
  canAccessNotificationPreference,
  canAccessProject,
  canAccessPushSubscription,
  canAccessShare,
  canAccessSpace,
  canAccessTimer,
} from "@/lib/auth/ownership"

const admin: Actor = { kind: "user", user: { id: "admin_1", role: "admin" } }
const user: Actor = { kind: "user", user: { id: "user_1", role: "user" } }
const claimingUser: Actor = { kind: "user", user: { id: "user_1", role: "user" }, restoreKey: "restoreKey_123" }
const anonymous: Actor = { kind: "anonymous", restoreKey: "restoreKey_123" }

describe("auth ownership helpers", () => {
  it("lets admins access owned entities across resources", () => {
    expect(canAccessProject(admin, "delete", { ownerId: "user_2" })).toBe(true)
    expect(canAccessTimer(admin, "update", { ownerId: "user_2" })).toBe(true)
    expect(canAccessSpace(admin, "read", { ownerId: "user_2" })).toBe(true)
    expect(canAccessPushSubscription(admin, "delete", { ownerId: "user_2" })).toBe(true)
    expect(canAccessNotificationPreference(admin, "update", { ownerId: "user_2" })).toBe(true)
  })

  it("limits signed-in users to their own owned entities", () => {
    expect(canAccessProject(user, "read", { ownerId: "user_1" })).toBe(true)
    expect(canAccessTimer(user, "update", { ownerId: "user_1" })).toBe(true)
    expect(canAccessSpace(user, "delete", { ownerId: "user_1" })).toBe(true)

    expect(canAccessProject(user, "read", { ownerId: "user_2" })).toBe(false)
    expect(canAccessTimer(user, "update", { ownerId: "user_2" })).toBe(false)
    expect(canAccessSpace(user, "delete", { ownerId: "user_2" })).toBe(false)
  })

  it("lets anonymous actors use only matching restore-key entities", () => {
    expect(canAccessProject(anonymous, "read", { restoreKey: "restoreKey_123" })).toBe(true)
    expect(canAccessProject(anonymous, "read", { restoreKey: "restoreKey_456" })).toBe(false)
    expect(canAccessShare(anonymous, "create", { restoreKeyMatchesActor: true })).toBe(true)
    expect(canAccessShare(anonymous, "create", { restoreKeyMatchesActor: false })).toBe(false)
  })

  it("supports claim checks from a pre-validated restore-key match", () => {
    expect(canAccessProject(claimingUser, "claim", { restoreKeyMatchesActor: true })).toBe(true)
    expect(canAccessProject(claimingUser, "claim", { restoreKeyMatchesActor: false })).toBe(false)
    expect(canAccessProject(user, "claim", { restoreKeyMatchesActor: true })).toBe(true)
  })

  it("throws resource-specific access errors", () => {
    expect(() => assertCanAccessShare(user, "delete", { ownerId: "user_2" })).toThrow(
      "Actor is not allowed to delete share.",
    )
  })
})

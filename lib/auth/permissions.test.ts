import { describe, expect, it } from "vitest"

import type { Actor } from "@/lib/contracts"
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  actorRole,
  assertCanAccessEntity,
  canAccessEntity,
} from "./permissions"

const admin: Actor = { kind: "user", user: { id: "admin_1", email: "admin@example.com", role: "admin" } }
const user: Actor = { kind: "user", user: { id: "user_1", email: "user@example.com", role: "user" } }
const defaultUser: Actor = { kind: "user", user: { id: "user_1", email: "user@example.com" } }
const anonymous: Actor = { kind: "anonymous", restoreKey: "restoreKey_123" }

describe("auth permissions", () => {
  it("lets admins perform every action on every resource", () => {
    for (const resource of PERMISSION_RESOURCES) {
      for (const action of PERMISSION_ACTIONS) {
        expect(canAccessEntity(admin, action, "someone_else", { resource })).toBe(true)
      }
    }
  })

  it("treats signed-in actors without explicit role as users", () => {
    expect(actorRole(defaultUser)).toBe("user")
    expect(canAccessEntity(defaultUser, "read", "user_1")).toBe(true)
  })

  it("limits users to their own entities", () => {
    expect(canAccessEntity(user, "create", "user_1")).toBe(true)
    expect(canAccessEntity(user, "read", "user_1")).toBe(true)
    expect(canAccessEntity(user, "update", "user_1")).toBe(true)
    expect(canAccessEntity(user, "delete", "user_1")).toBe(true)

    expect(canAccessEntity(user, "create", "user_2")).toBe(false)
    expect(canAccessEntity(user, "read", "user_2")).toBe(false)
    expect(canAccessEntity(user, "update", "user_2")).toBe(false)
    expect(canAccessEntity(user, "delete", "user_2")).toBe(false)
  })

  it("allows a user to claim only when restore-key access is matched", () => {
    const claimingUser: Actor = { kind: "user", user: { id: "user_1" }, restoreKey: "restoreKey_123" }

    expect(canAccessEntity(claimingUser, "claim", null, { entityRestoreKey: "restoreKey_123" })).toBe(true)
    expect(canAccessEntity(claimingUser, "claim", null, { entityRestoreKey: "restoreKey_456" })).toBe(false)
    expect(canAccessEntity(user, "claim", null, { entityRestoreKey: "restoreKey_123" })).toBe(false)
    expect(canAccessEntity(user, "claim", null, { restoreKeyMatchesActor: true })).toBe(true)
    expect(canAccessEntity(claimingUser, "claim", null, { restoreKeyMatchesActor: false })).toBe(false)
  })

  it("gives anonymous actors only matching restore-key access", () => {
    expect(canAccessEntity(anonymous, "create", null, { entityRestoreKey: "restoreKey_123" })).toBe(true)
    expect(canAccessEntity(anonymous, "read", null, { entityRestoreKey: "restoreKey_123" })).toBe(true)
    expect(canAccessEntity(anonymous, "update", null, { entityRestoreKey: "restoreKey_123" })).toBe(true)
    expect(canAccessEntity(anonymous, "delete", null, { entityRestoreKey: "restoreKey_123" })).toBe(true)

    expect(canAccessEntity(anonymous, "read", null, { entityRestoreKey: "restoreKey_456" })).toBe(false)
    expect(canAccessEntity(anonymous, "read", null, { restoreKeyMatchesActor: true })).toBe(true)
    expect(canAccessEntity(anonymous, "read", null, { restoreKeyMatchesActor: false })).toBe(false)
    expect(canAccessEntity(anonymous, "read")).toBe(false)
    expect(canAccessEntity(anonymous, "claim", null, { entityRestoreKey: "restoreKey_123" })).toBe(false)
  })

  it("throws a resource-specific error for denied access", () => {
    expect(() => assertCanAccessEntity(user, "delete", "user_2", { resource: "timer" })).toThrow(
      "Actor is not allowed to delete timer.",
    )
  })
})

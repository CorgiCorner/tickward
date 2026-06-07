import { describe, expect, it } from "vitest"

import type { Actor } from "@/lib/contracts"
import { canAccessEntity } from "@/lib/auth/permissions"
import { APP_ACCESS_STATEMENTS, appAccessControl, appAccessRoles } from "./access-control"

describe("auth access control", () => {
  it("keeps Better Auth admin resources and app resources in one access control definition", () => {
    expect(appAccessControl.statements).toBe(APP_ACCESS_STATEMENTS)
    expect(appAccessControl.statements.project).toContain("claim")
    expect(appAccessControl.statements.user).toContain("set-role")
    expect(appAccessControl.statements.session).toContain("revoke")
  })

  it("lets admins use Better Auth admin actions and app actions", () => {
    expect(
      appAccessRoles.admin.authorize({ user: ["set-role"], session: ["revoke"], project: ["delete"] }).success,
    ).toBe(true)
  })

  it("keeps regular users away from Better Auth admin actions", () => {
    expect(appAccessRoles.user.authorize({ project: ["read"], timer: ["claim"] }).success).toBe(true)
    expect(appAccessRoles.user.authorize({ user: ["set-role"] }).success).toBe(false)
  })

  it("still requires domain ownership checks after role-level access passes", () => {
    const user: Actor = { kind: "user", user: { id: "user_1", role: "user" } }

    expect(appAccessRoles.user.authorize({ timer: ["read"] }).success).toBe(true)
    expect(canAccessEntity(user, "read", "user_2", { resource: "timer" })).toBe(false)
  })
})

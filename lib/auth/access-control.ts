import { createAccessControl } from "better-auth/plugins"

import { PERMISSION_ACTIONS } from "@/lib/auth/permissions"

export const BETTER_AUTH_ADMIN_USER_ACTIONS = [
  "create",
  "list",
  "set-role",
  "ban",
  "impersonate",
  "impersonate-admins",
  "delete",
  "set-password",
  "get",
  "update",
] as const

export const BETTER_AUTH_ADMIN_SESSION_ACTIONS = ["list", "revoke", "delete"] as const

export const APP_ACCESS_STATEMENTS = {
  user: BETTER_AUTH_ADMIN_USER_ACTIONS,
  session: BETTER_AUTH_ADMIN_SESSION_ACTIONS,
  project: PERMISSION_ACTIONS,
  timer: PERMISSION_ACTIONS,
  space: PERMISSION_ACTIONS,
  share: PERMISSION_ACTIONS,
  pushSubscription: PERMISSION_ACTIONS,
  notificationPreference: PERMISSION_ACTIONS,
} as const

export const appAccessControl = createAccessControl(APP_ACCESS_STATEMENTS)

export const appAccessRoles = {
  admin: appAccessControl.newRole(APP_ACCESS_STATEMENTS),
  user: appAccessControl.newRole({
    user: [],
    session: [],
    project: PERMISSION_ACTIONS,
    timer: PERMISSION_ACTIONS,
    space: PERMISSION_ACTIONS,
    share: PERMISSION_ACTIONS,
    pushSubscription: PERMISSION_ACTIONS,
    notificationPreference: PERMISSION_ACTIONS,
  }),
} as const

import { getAnonymousEntitlements } from "@/lib/entitlements"

const entitlements = getAnonymousEntitlements()

export const LIMITS = {
  projects: entitlements.maxProjects,
  spacesPerProject: entitlements.maxSpaces,
  timersPerProject: entitlements.maxTimers,
} as const

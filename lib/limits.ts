import { getEntitlements } from "@/lib/entitlements"

export function getLimits() {
  const entitlements = getEntitlements()
  return {
    projects: entitlements.maxProjects,
    spacesPerProject: entitlements.maxSpaces,
    timersPerProject: entitlements.maxTimers,
  }
}

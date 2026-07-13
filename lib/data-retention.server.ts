import "server-only"

import { optionalServerEnv, type ServerEnvVar } from "@/lib/env.server"

function retentionDays(name: ServerEnvVar): number | null {
  const raw = optionalServerEnv(name)
  if (!raw || !/^\d+$/.test(raw)) return null

  const days = Number.parseInt(raw, 10)
  return Number.isSafeInteger(days) && days > 0 ? days : null
}

/**
 * Days of inactivity after which ownerless (unclaimed) projects are deleted
 * by the scheduler GC. Null disables the GC and the footer disclosure.
 */
export function ownerlessProjectRetentionDays(): number | null {
  return retentionDays("TICKWARD_OWNERLESS_PROJECT_RETENTION_DAYS")
}

/**
 * Days a project can stay read-only over the plan limit before the scheduler
 * GC deletes it. Null disables the GC and the footer disclosure.
 */
export function overLimitProjectRetentionDays(): number | null {
  return retentionDays("TICKWARD_OVER_LIMIT_PROJECT_RETENTION_DAYS")
}

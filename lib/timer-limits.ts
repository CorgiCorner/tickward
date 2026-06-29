// Compatibility shim over lib/entitlements. New code should read limits from
// getEntitlements()/canCreateTimer/timerLimitMessage in lib/entitlements; these
// re-exports keep older call sites and their tests working unchanged.

import { ANONYMOUS_ENTITLEMENTS, timerLimitMessage as entitlementsTimerLimitMessage } from "@/lib/entitlements"
import { formatMessage } from "@/lib/i18n/messages"
import { LIMITS } from "@/lib/limits"

export const MAX_TIMERS = LIMITS.timersPerProject
export const TIMER_WARN_THRESHOLD = Math.floor(LIMITS.timersPerProject * 0.75)

export function timerWarnThreshold(maxTimers = MAX_TIMERS) {
  return Math.max(1, Math.floor(maxTimers * 0.75))
}

export function timerLimitMessage(maxTimers = MAX_TIMERS) {
  return entitlementsTimerLimitMessage({ ...ANONYMOUS_ENTITLEMENTS, maxTimers })
}

export function timerLimitWarningMessage(timerCount: number, maxTimers = MAX_TIMERS) {
  const warnAt = timerWarnThreshold(maxTimers)
  if (timerCount !== warnAt) return null
  return formatMessage("timer.limit.warn", { count: warnAt, max: maxTimers })
}

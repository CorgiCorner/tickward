// Compatibility shim over lib/entitlements. New code should read limits from
// getEntitlements()/canCreateTimer/timerLimitMessage in lib/entitlements; these
// re-exports keep older call sites and their tests working unchanged.

import { getEntitlements, timerLimitMessage as entitlementsTimerLimitMessage } from "@/lib/entitlements"
import { formatMessage } from "@/lib/i18n/messages"

export function timerWarnThreshold(maxTimers?: number) {
  const resolvedMaxTimers = maxTimers ?? getEntitlements().maxTimers
  return Math.max(1, Math.floor(resolvedMaxTimers * 0.75))
}

export function timerLimitMessage(maxTimers?: number) {
  const entitlements = getEntitlements()
  return entitlementsTimerLimitMessage({ ...entitlements, maxTimers: maxTimers ?? entitlements.maxTimers })
}

export function timerLimitWarningMessage(timerCount: number, maxTimers?: number) {
  const resolvedMaxTimers = maxTimers ?? getEntitlements().maxTimers
  const warnAt = timerWarnThreshold(resolvedMaxTimers)
  if (timerCount !== warnAt) return null
  return formatMessage("timer.limit.warn", { count: warnAt, max: resolvedMaxTimers })
}

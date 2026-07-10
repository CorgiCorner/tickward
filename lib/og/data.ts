import { formatInTimeZone } from "date-fns-tz"

import { isSupportedTimeZone } from "@/lib/timezones"
import { getCountdownParts, pad2 } from "@/lib/utils"

export type OgCountdownSnapshot = {
  isCountUp: boolean
  days: string
  hours: string
  minutes: string
  seconds: string
}

const OG_DATE_FORMAT = "MMM d, yyyy · HH:mm"

function finiteMs(value: string) {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function ogCountdownSnapshot(targetDateIsoUtc: string, nowMs = Date.now()): OgCountdownSnapshot {
  const parts = getCountdownParts(targetDateIsoUtc, nowMs)

  return {
    isCountUp: parts.isCountUp,
    days: String(parts.days),
    hours: pad2(parts.hours),
    minutes: pad2(parts.minutes),
    seconds: pad2(parts.seconds),
  }
}

export function formatOgDateLabel(targetDateIsoUtc: string, timezone: string) {
  const target = new Date(targetDateIsoUtc)
  if (!Number.isFinite(target.getTime())) return timezone || "UTC"

  const zone = isSupportedTimeZone(timezone) ? timezone : "UTC"
  return `${formatInTimeZone(target, zone, OG_DATE_FORMAT)} · ${zone}`
}

export function ogProgressFraction(createdAt: string | undefined, targetDateIsoUtc: string, nowMs = Date.now()) {
  if (!createdAt) return null

  const startMs = finiteMs(createdAt)
  const targetMs = finiteMs(targetDateIsoUtc)
  if (startMs === null || targetMs === null || targetMs <= startMs) return null

  const fraction = (nowMs - startMs) / (targetMs - startMs)
  return Math.min(1, Math.max(0, fraction))
}

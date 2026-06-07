export const PINNED_TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles"] as const
export const DEFAULT_TIMEZONE_STORAGE_KEY = "tickward:default-timezone"

const FALLBACK_TIMEZONES: string[] = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Warsaw",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Athens",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
]

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

export function isSupportedTimeZone(value: string) {
  if (!value) return false
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

export function getStoredDefaultTimeZone() {
  if (globalThis.window === undefined) return null
  try {
    const value = globalThis.localStorage.getItem(DEFAULT_TIMEZONE_STORAGE_KEY)
    return value && isSupportedTimeZone(value) ? value : null
  } catch {
    return null
  }
}

export function getDefaultTimeZone() {
  return getStoredDefaultTimeZone() ?? getBrowserTimeZone()
}

export function getAllTimeZones(): string[] {
  const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  if (typeof intlAny.supportedValuesOf === "function") {
    const zones = intlAny.supportedValuesOf("timeZone")
    if (Array.isArray(zones) && zones.length > 0) return zones
  }
  return FALLBACK_TIMEZONES
}

export function getPinnedTimeZones(localTz: string) {
  const unique = new Set<string>([localTz, ...PINNED_TIMEZONES])
  return Array.from(unique)
}

// Service status for the footer indicator, derived from the public Uptime Kuma
// status page. The Kuma heartbeat API sends no CORS headers, so this must be
// fetched server-side. Result is cached for 60s (one upstream call per minute
// regardless of traffic) and degrades to "unknown" on any error.

const STATUS_PAGE_ORIGIN = "https://status.tickward.com"
const STATUS_PAGE_SLUG = "tickward"
const FETCH_TIMEOUT_MS = 2000

/** Public URL of the status page (also used for the footer link). */
export const STATUS_PAGE_URL = STATUS_PAGE_ORIGIN

export type ServiceStatusLevel = "operational" | "degraded" | "down" | "unknown"

// Uptime Kuma heartbeat status codes: 0 down, 1 up, 2 pending, 3 maintenance.
type HeartbeatResponse = {
  heartbeatList?: Record<string, Array<{ status?: number }>>
}

/** Worst current status across all monitors on the public status page. */
export async function getServiceStatusLevel(): Promise<ServiceStatusLevel> {
  const url = `${STATUS_PAGE_ORIGIN}/api/status-page/heartbeat/${STATUS_PAGE_SLUG}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal, next: { revalidate: 60 } })
    if (!response.ok) return "unknown"

    const data = (await response.json()) as HeartbeatResponse
    const latest = Object.values(data.heartbeatList ?? {})
      .map((beats) => beats.at(-1)?.status)
      .filter((status): status is number => typeof status === "number")

    if (latest.length === 0) return "unknown"
    if (latest.some((status) => status === 0)) return "down"
    if (latest.some((status) => status === 2 || status === 3)) return "degraded"
    if (latest.every((status) => status === 1)) return "operational"
    return "unknown"
  } catch {
    return "unknown"
  } finally {
    clearTimeout(timer)
  }
}

/** Tailwind background class for the footer status dot. */
export function statusDotClass(level: ServiceStatusLevel): string {
  switch (level) {
    case "operational":
      return "bg-emerald-500"
    case "degraded":
      return "bg-amber-500"
    case "down":
      return "bg-red-500"
    default:
      return "bg-muted-foreground/40"
  }
}

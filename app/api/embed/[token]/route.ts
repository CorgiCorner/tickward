import { NextResponse } from "next/server"

import { deriveEmbedState, type EmbedState } from "@/lib/embed-state"
import { checkRateLimit } from "@/lib/rate-limit.server"
import { isRoutableShareId } from "@/lib/share-model"
import { resolveTimerShare } from "@/lib/share-service.server"

export const runtime = "nodejs"

// Timer state endpoint (embed contract section 2). Public, no auth - the
// share token is the capability. Consumers count down client-side from
// `targetDate`, offset by (`now` - local clock), and re-fetch
// opportunistically, never per-second.

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
} as const

type EmbedStateResponse = {
  state: EmbedState
  now: string
  timer?: {
    label: string
    targetDate: string
    timezone: string
    color?: string
    description?: string
  }
}

function stateResponse(body: EmbedStateResponse, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { headers: { ...RESPONSE_HEADERS, ...headers } })
}

function unavailable(now: string) {
  return stateResponse({ state: "unavailable", now })
}

function shouldTrustProxyHeaders() {
  return process.env.TICKWARD_TRUST_PROXY_HEADERS === "true" || process.env.TRUST_PROXY_HEADERS === "true"
}

function clientIp(req: Request) {
  if (!shouldTrustProxyHeaders()) return "unknown"

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwardedFor) return forwardedFor
  return req.headers.get("x-real-ip")?.trim() ?? "unknown"
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const now = new Date()
  const nowIso = now.toISOString()

  if (!isRoutableShareId(token)) return unavailable(nowIso)

  try {
    const limit = await checkRateLimit("embed-state", `${clientIp(request)}:${token}`)
    if (!limit.allowed) {
      return stateResponse(
        { state: "unavailable", now: nowIso },
        { ...limit.headers, "Cache-Control": "private, no-store" },
      )
    }
  } catch {
    // Embeds are anonymous read-only consumers: fail open when the rate
    // limiter backend is unreachable rather than breaking host pages.
  }

  const resolved = await resolveTimerShare(token)
  if (!resolved) return unavailable(nowIso)

  return stateResponse({
    state: deriveEmbedState(resolved.timer.targetDate, now.getTime()),
    now: nowIso,
    timer: {
      label: resolved.timer.label,
      targetDate: resolved.timer.targetDate,
      timezone: resolved.timer.timezone,
      ...(resolved.timer.color ? { color: resolved.timer.color } : {}),
      ...(resolved.timer.description ? { description: resolved.timer.description } : {}),
    },
  })
}

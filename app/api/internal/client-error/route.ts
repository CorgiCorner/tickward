import { NextResponse } from "next/server"
import { z } from "zod"

import { getPublicReleaseTag } from "@/lib/release.server"

export const runtime = "nodejs"

// Receives client-side error reports from the error boundaries and the client
// instrumentation hook. It logs a structured line (so reports show up in the
// hosting platform logs, e.g. CloudWatch) and, when configured, forwards to a
// provider-agnostic collector. No external monitor is required.

const MAX_BODY_BYTES = 16_384
const RATE_WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

const reportSchema = z.object({
  kind: z.enum(["react", "window", "unhandledrejection"]),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(200).optional(),
  source: z.string().max(2000).optional(),
  url: z.string().max(2000).optional(),
  userAgent: z.string().max(1000).optional(),
  appVersion: z.string().max(50).optional(),
  at: z.string().max(40).optional(),
})

// Best-effort per-instance throttle. It is not distributed (serverless instances
// don't share it), but it caps log spam from a single crash-looping client.
const hits = new Map<string, number[]>()

function isThrottled(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < RATE_WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  return false
}

function clientIp(req: Request): string {
  const trustProxy = process.env.TICKWARD_TRUST_PROXY_HEADERS === "true" || process.env.TRUST_PROXY_HEADERS === "true"
  if (!trustProxy) return "unknown"
  const forwarded = req.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || "unknown"
}

/** Test-only: clear the in-memory throttle window. */
export function __resetClientErrorRateLimit() {
  hits.clear()
}

export async function POST(req: Request) {
  const body = await req.text()
  if (body.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 })

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const parsed = reportSchema.safeParse(json)
  if (!parsed.success) return new NextResponse(null, { status: 400 })

  if (isThrottled(clientIp(req))) return new NextResponse(null, { status: 429 })

  const record = {
    ...parsed.data,
    serverVersion: getPublicReleaseTag(),
    receivedAt: new Date().toISOString(),
  }

  // Structured server log → visible in the hosting platform's logs.
  console.error("[tickward] client-error", JSON.stringify(record))

  // Optional, provider-agnostic forward (a Sentry tunnel, a webhook, any
  // collector). Best effort — a failed forward never fails the request.
  const forwardUrl = process.env.TICKWARD_CLIENT_ERROR_WEBHOOK_URL
  if (forwardUrl) {
    try {
      await fetch(forwardUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      })
    } catch {
      // ignore forward failures
    }
  }

  return new NextResponse(null, { status: 204 })
}

export function GET() {
  return new NextResponse(null, { status: 405 })
}

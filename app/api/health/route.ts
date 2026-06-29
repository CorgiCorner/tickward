import { NextResponse } from "next/server"

import { getPrismaClient } from "@/lib/db/prisma.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DB_TIMEOUT_MS = 2000

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("health check timed out")), ms)),
  ])
}

// Public, unauthenticated liveness probe consumed by the status page (Uptime Kuma).
// 200 => app is up AND the database answers; 503 => something critical is down.
export async function GET() {
  const prisma = getPrismaClient()

  if (!prisma) {
    return NextResponse.json({ ok: false, db: "unavailable" }, { status: 503, headers: NO_STORE })
  }

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS)
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: NO_STORE })
  }

  return NextResponse.json({ ok: true, db: "up" }, { status: 200, headers: NO_STORE })
}

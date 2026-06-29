import { NextResponse } from "next/server"

import { getServiceStatusLevel } from "@/lib/status-summary"

export const runtime = "nodejs"
export const revalidate = 60

// Same-origin proxy for the footer status dot: the public status page has no
// CORS headers, so the browser can't read it directly. Cached for 60s.
export async function GET() {
  const level = await getServiceStatusLevel()
  return NextResponse.json({ level }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } })
}

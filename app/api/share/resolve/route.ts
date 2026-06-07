import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { isValidShareId } from "@/lib/share-model"
import { resolveTimerShare } from "@/lib/share-service.server"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id || !isValidShareId(id)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidShareId, "errors.invalidShareId", { status: 400 })
  }

  const resolved = await resolveTimerShare(id)
  if (!resolved) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.notFound, "errors.notFound", { status: 404 })
  }

  return NextResponse.json(resolved, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  })
}

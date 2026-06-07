import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { isValidShareId } from "@/lib/share-model"
import { resolveTimerShareBatch } from "@/lib/share-service.server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson", { status: 400 })
  }

  const payload = body as { ids?: unknown }
  if (!Array.isArray(payload.ids) || payload.ids.length === 0 || payload.ids.length > 50) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidIds, "errors.invalidIds", { status: 400 })
  }

  const ids: string[] = payload.ids.filter((id): id is string => typeof id === "string" && isValidShareId(id))

  const batchResults = await resolveTimerShareBatch(ids)
  const results = ids.map((id) => {
    const resolved = batchResults.get(id)
    if (!resolved) {
      return { id, status: "not_found" as const }
    }
    return { id, timer: resolved.timer, status: "ok" as const }
  })

  return NextResponse.json(
    { results },
    {
      headers: { "Cache-Control": "private, max-age=15" },
    },
  )
}

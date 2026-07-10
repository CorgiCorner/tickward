import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { optionalServerEnv } from "@/lib/env.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "edge"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidJson, "errors.invalidJson", { status: 400 })
  }

  const { photoId } = body as { photoId?: string }
  if (!photoId || typeof photoId !== "string") {
    return apiErrorResponse(PUBLIC_ERROR_CODES.missingPhotoId, "errors.missingPhotoId", { status: 400 })
  }
  if (!/^[A-Za-z0-9_-]+$/.test(photoId)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.invalidPhotoId, "errors.invalidPhotoId", { status: 400 })
  }

  const key = optionalServerEnv("UNSPLASH_ACCESS_KEY")
  if (!key) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.unsplashNotConfigured, "errors.unsplashNotConfigured", { status: 500 })
  }

  // Trigger download endpoint as required by Unsplash guidelines
  await fetch(`https://api.unsplash.com/photos/${photoId}/download`, {
    headers: { Authorization: `Client-ID ${key}` },
  })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { getWebPushConfig } from "@/lib/private-config.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "nodejs"

export async function GET() {
  const config = getWebPushConfig()
  if (!config) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.webPushNotConfigured, "errors.webPushNotConfigured", { status: 501 })
  }

  return NextResponse.json(
    { publicKey: config.publicKey },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    },
  )
}

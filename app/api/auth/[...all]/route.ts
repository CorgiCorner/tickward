import { toNextJsHandler } from "better-auth/next-js"
import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { enforceEmailOtpSendRateLimit, isEmailOtpSendRequest } from "@/lib/auth/email-otp-rate-limit.server"
import { getTickwardAuth } from "@/lib/auth/auth.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "nodejs"

function unavailable() {
  return apiErrorResponse(PUBLIC_ERROR_CODES.authNotConfigured, "errors.authNotConfigured", { status: 501 })
}

function handlers() {
  try {
    const auth = getTickwardAuth()
    return auth ? toNextJsHandler(auth) : null
  } catch {
    return null
  }
}

function isSessionRead(req: Request) {
  return new URL(req.url).pathname.endsWith("/api/auth/get-session")
}

export async function GET(req: Request) {
  const handler = handlers()?.GET
  if (handler) return handler(req)
  if (isSessionRead(req)) return NextResponse.json(null)
  return unavailable()
}

export async function POST(req: Request) {
  const handler = handlers()?.POST
  if (!handler) return unavailable()
  if (isEmailOtpSendRequest(req)) {
    const rateLimitResponse = await enforceEmailOtpSendRateLimit(req)
    if (rateLimitResponse) return rateLimitResponse
  }
  return handler(req)
}

export async function PATCH(req: Request) {
  return handlers()?.PATCH(req) ?? unavailable()
}

export async function PUT(req: Request) {
  return handlers()?.PUT(req) ?? unavailable()
}

export async function DELETE(req: Request) {
  return handlers()?.DELETE(req) ?? unavailable()
}

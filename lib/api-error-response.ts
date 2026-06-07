import { NextResponse } from "next/server"

import { createPublicError, type PublicError, type PublicErrorCode, type PublicErrorDetails } from "@/lib/public-errors"
import type { MessageKey } from "@/lib/i18n/messages"

type ApiErrorResponseInit = {
  details?: PublicErrorDetails
  headers?: HeadersInit
  status: number
}

export function publicErrorResponse(error: PublicError, init: Omit<ApiErrorResponseInit, "details">) {
  return NextResponse.json({ error }, { headers: init.headers, status: init.status })
}

export function apiErrorResponse(code: PublicErrorCode, messageKey: MessageKey, init: ApiErrorResponseInit) {
  return publicErrorResponse(createPublicError(code, messageKey, init.details), init)
}

import { NextResponse } from "next/server"

export type ApiErrorType =
  | "idempotency_conflict"
  | "idempotency_key_in_progress"
  | "invalid_api_key"
  | "insufficient_scope"
  | "limit_exceeded"
  | "missing_api_key"
  | "method_not_allowed"
  | "not_found"
  | "plan_hash_mismatch"
  | "rate_limit_unavailable"
  | "rate_limited"
  | "restricted_api_key"
  | "storage_unavailable"
  | "unauthorized"
  | "validation_error"

export type ApiErrorInit = {
  details?: unknown
  headers?: HeadersInit
  status: number
}

export function apiJson(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, init)
}

export function apiError(type: ApiErrorType, message: string, init: ApiErrorInit) {
  return apiJson(
    {
      error: init.details ? { type, message, details: init.details } : { type, message },
    },
    { headers: init.headers, status: init.status },
  )
}

export function apiList<T>(data: T[], hasMore = false) {
  return { object: "list" as const, data, has_more: hasMore }
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

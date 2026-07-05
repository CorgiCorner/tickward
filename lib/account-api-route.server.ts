import "server-only"

import { getCurrentActor } from "@/lib/actor.server"
import { apiError } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"
import { checkRateLimit, type RateLimitBucket } from "@/lib/rate-limit.server"

export async function requireSignedInUser(req: Request, unauthorizedMessage: string): Promise<UserActor | Response> {
  try {
    const actor = await getCurrentActor({ request: req })
    if (actor.kind === "user") return actor
  } catch {}
  return apiError("unauthorized", unauthorizedMessage, { status: 401 })
}

export async function enforceAccountRateLimit(input: {
  bucket: RateLimitBucket
  key: string
  limitedMessage?: string
}): Promise<Response | null> {
  try {
    const rateLimit = await checkRateLimit(input.bucket, input.key)
    if (rateLimit.allowed) return null
    return apiError("rate_limited", input.limitedMessage ?? "Too many requests.", {
      headers: rateLimit.headers,
      status: 429,
    })
  } catch {
    return apiError("rate_limit_unavailable", "Rate limit unavailable.", { status: 503 })
  }
}

export async function readAccountRouteJson(req: Request): Promise<unknown | Response> {
  try {
    return await req.json()
  } catch {
    return apiError("validation_error", "Request body must be valid JSON.", { status: 400 })
  }
}

export async function readOptionalAccountRouteJson(req: Request): Promise<unknown | null> {
  return await req.json().catch(() => null)
}

export function accountRouteStorageUnavailable(input: {
  error: unknown
  logName: string
  message: string
  operation: string
}) {
  console.error(`[tickward] ${input.logName}.${input.operation}`, input.error)
  return apiError("storage_unavailable", input.message, { status: 503 })
}

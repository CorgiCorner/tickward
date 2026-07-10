import "server-only"

import { Ratelimit } from "@upstash/ratelimit"
import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { getRedis } from "@/lib/redis"
import type { RateLimitBucket } from "@/lib/repositories"

export type { RateLimitBucket } from "@/lib/repositories"

const RATE_LIMITS = {
  write: { limit: 30, window: "60 s", prefix: "tickward:ratelimit:write" },
  "share-create": { limit: 10, window: "60 s", prefix: "tickward:ratelimit:share-create" },
  clear: { limit: 5, window: "60 s", prefix: "tickward:ratelimit:clear" },
  "embed-state": { limit: 60, window: "60 s", prefix: "tickward:ratelimit:embed-state" },
  "embed-seen": { limit: 10, window: "60 s", prefix: "tickward:ratelimit:embed-seen" },
  "auth-otp": { limit: 1, window: "60 s", prefix: "tickward:ratelimit:auth-otp" },
  "auth-otp-ip": { limit: 3, window: "60 s", prefix: "tickward:ratelimit:auth-otp-ip" },
  "public-api": { limit: 120, window: "60 s", prefix: "tickward:ratelimit:public-api" },
  "public-api-ip": { limit: 300, window: "60 s", prefix: "tickward:ratelimit:public-api-ip" },
  inbox: { limit: 60, window: "60 s", prefix: "tickward:ratelimit:inbox" },
  "account-export": { limit: 2, window: "60 s", prefix: "tickward:ratelimit:account-export" },
  "api-key-management": { limit: 20, window: "60 s", prefix: "tickward:ratelimit:api-key-management" },
  "webhook-management": { limit: 20, window: "60 s", prefix: "tickward:ratelimit:webhook-management" },
  "webhook-test": { limit: 3, window: "60 s", prefix: "tickward:ratelimit:webhook-test" },
  "mcp-connection-management": { limit: 20, window: "60 s", prefix: "tickward:ratelimit:mcp-connection-management" },
  "mcp-oauth-exchange": { limit: 30, window: "60 s", prefix: "tickward:ratelimit:mcp-oauth-exchange" },
  "mcp-oauth-grant": { limit: 20, window: "60 s", prefix: "tickward:ratelimit:mcp-oauth-grant" },
  "desktop-oauth-exchange": { limit: 30, window: "60 s", prefix: "tickward:ratelimit:desktop-oauth-exchange" },
  "desktop-oauth-grant": { limit: 20, window: "60 s", prefix: "tickward:ratelimit:desktop-oauth-grant" },
} as const

type RateLimiter = InstanceType<typeof Ratelimit>

const limiters: Partial<Record<RateLimitBucket, RateLimiter>> = {}

function getRateLimiter(bucket: RateLimitBucket) {
  const cached = limiters[bucket]
  if (cached) return cached

  const config = RATE_LIMITS[bucket]
  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    prefix: config.prefix,
    ephemeralCache: false,
  })
  limiters[bucket] = limiter
  return limiter
}

function rateLimitHeaders(result: { limit: number; remaining: number; reset: number }) {
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
  return {
    "ratelimit-limit": String(result.limit),
    "ratelimit-remaining": String(result.remaining),
    "ratelimit-reset": String(retryAfter),
    "retry-after": String(retryAfter),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  }
}

export async function checkRateLimit(bucket: RateLimitBucket, key: string) {
  const result = await getRateLimiter(bucket).limit(key)
  return {
    allowed: result.success,
    headers: rateLimitHeaders(result),
    retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
  }
}

export async function enforceRateLimit(bucket: RateLimitBucket, key: string): Promise<NextResponse | null> {
  try {
    const result = await checkRateLimit(bucket, key)
    if (result.allowed) return null

    return apiErrorResponse(PUBLIC_ERROR_CODES.rateLimited, "errors.rateLimited", {
      details: { retryAfter: result.retryAfter },
      headers: result.headers,
      status: 429,
    })
  } catch {
    return apiErrorResponse(PUBLIC_ERROR_CODES.rateLimitUnavailable, "errors.rateLimitUnavailable", { status: 503 })
  }
}

import "server-only"

import { Redis } from "@upstash/redis"
import { requireServerEnv } from "@/lib/env.server"

let _redis: Redis | null = null

export function getRedis() {
  if (_redis) return _redis
  // Avoid noisy logs at build time; only initialize when a route is called.
  _redis = new Redis({
    url: requireServerEnv("UPSTASH_REDIS_REST_URL"),
    token: requireServerEnv("UPSTASH_REDIS_REST_TOKEN"),
  })
  return _redis
}

export const REDIS_TTL_SECONDS = 60 * 60 * 24 * 90

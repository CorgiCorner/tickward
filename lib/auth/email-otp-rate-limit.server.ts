import "server-only"

import { createHash } from "node:crypto"

import { z } from "zod"

import { enforceRateLimit } from "@/lib/rate-limit.server"

const emailOtpSendPayloadSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
})

function hashRateLimitValue(prefix: string, value: string) {
  const hash = createHash("sha256").update(value, "utf8").digest("hex")
  return `${prefix}:${hash}`
}

function emailRateLimitKey(email: string) {
  return hashRateLimitValue("email", email)
}

function firstForwardedValue(value: string | null) {
  const first = value?.split(",")[0]?.trim()
  if (!first) return null
  return first
}

function forwardedHeaderIp(value: string | null) {
  const first = firstForwardedValue(value)
  const match = first === null ? null : /(?:^|;)for=(?:"?)([^";,]+)(?:"?)/i.exec(first)
  const ip = match?.[1]?.trim()
  if (!ip) return null
  return ip
}

function requestIp(req: Request) {
  return (
    firstForwardedValue(req.headers.get("cf-connecting-ip")) ??
    firstForwardedValue(req.headers.get("x-real-ip")) ??
    firstForwardedValue(req.headers.get("x-forwarded-for")) ??
    forwardedHeaderIp(req.headers.get("forwarded")) ??
    "unknown"
  )
}

export function isEmailOtpSendRequest(req: Request) {
  return new URL(req.url).pathname.endsWith("/api/auth/email-otp/send-verification-otp")
}

export async function enforceEmailOtpSendRateLimit(req: Request) {
  const ipRateLimitResponse = await enforceRateLimit("auth-otp-ip", hashRateLimitValue("ip", requestIp(req)))
  if (ipRateLimitResponse) return ipRateLimitResponse

  let payload: unknown
  try {
    payload = await req.clone().json()
  } catch {
    return null
  }

  const parsed = emailOtpSendPayloadSchema.safeParse(payload)
  if (!parsed.success) return null

  return enforceRateLimit("auth-otp", emailRateLimitKey(parsed.data.email))
}

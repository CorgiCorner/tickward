import "server-only"

import { createHash } from "node:crypto"

import { z } from "zod"

import { trustedClientIp, UNKNOWN_CLIENT_IP } from "@/lib/client-ip.server"
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

export function isEmailOtpSendRequest(req: Request) {
  return new URL(req.url).pathname.endsWith("/api/auth/email-otp/send-verification-otp")
}

/**
 * Only a trusted proxy hop names the sender: a client-supplied header would let one sender rotate
 * through as many per-IP buckets as it likes. Without one, the per-email budget is spent first and
 * only a send it admits spends the shared backstop, so hammering one address (or sending payloads
 * Better Auth rejects anyway) cannot block code emails to other addresses.
 */
export async function enforceEmailOtpSendRateLimit(req: Request) {
  const ip = trustedClientIp(req)
  if (ip !== UNKNOWN_CLIENT_IP) {
    const limited = await enforceRateLimit("auth-otp-ip", hashRateLimitValue("ip", ip))
    if (limited) return limited
  }

  let payload: unknown
  try {
    payload = await req.clone().json()
  } catch {
    return null
  }

  const parsed = emailOtpSendPayloadSchema.safeParse(payload)
  if (!parsed.success) return null

  const limited = await enforceRateLimit("auth-otp", emailRateLimitKey(parsed.data.email))
  if (limited) return limited
  return ip === UNKNOWN_CLIENT_IP ? enforceRateLimit("auth-otp-unknown-ip", "all") : null
}

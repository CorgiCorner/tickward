import "server-only"

import { z } from "zod"

import { optionalServerEnv, requireServerEnv } from "@/lib/env.server"
import { formatMessage } from "@/lib/i18n/messages"

const nonEmptyStringSchema = z.string().trim().min(1)

export type BetterAuthAdapterConfig = {
  url: string
  secret: string
}

export type ResendAdapterConfig = {
  apiKey: string
  from: string
  replyTo?: string
}

export type WebPushAdapterConfig = {
  publicKey: string
  privateKey: string
  subject: string
}

function optionalNonEmpty(value: string | undefined) {
  return value ? nonEmptyStringSchema.parse(value) : undefined
}

function requireTogether(values: Record<string, string | undefined>, configName: string) {
  const present = Object.entries(values)
    .filter(([, value]) => value)
    .map(([name]) => name)
  if (present.length === 0) return false

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name)
  if (missing.length > 0) {
    throw new Error(formatMessage("errors.configPartialMissing", { config: configName, missing: missing.join(", ") }))
  }

  return true
}

export function getBetterAuthConfig(): BetterAuthAdapterConfig | null {
  const url = optionalNonEmpty(optionalServerEnv("BETTER_AUTH_URL"))
  const secret = optionalNonEmpty(optionalServerEnv("BETTER_AUTH_SECRET"))
  if (!requireTogether({ BETTER_AUTH_URL: url, BETTER_AUTH_SECRET: secret }, "Better Auth")) return null
  if (!url || !secret) return null

  return { url, secret }
}

export function getDatabaseUrl(): string | null {
  return optionalNonEmpty(optionalServerEnv("DATABASE_URL")) ?? null
}

export function getDirectDatabaseUrl(): string | null {
  return optionalNonEmpty(optionalServerEnv("DIRECT_URL")) ?? null
}

export function getResendConfig(): ResendAdapterConfig | null {
  const apiKey = optionalNonEmpty(optionalServerEnv("RESEND_API_KEY"))
  if (!apiKey) return null

  return {
    apiKey,
    from: nonEmptyStringSchema.parse(requireServerEnv("RESEND_FROM")),
    replyTo: optionalNonEmpty(optionalServerEnv("RESEND_REPLY_TO")),
  }
}

export function getWebPushConfig(): WebPushAdapterConfig | null {
  const publicKey = optionalNonEmpty(optionalServerEnv("WEB_PUSH_VAPID_PUBLIC_KEY"))
  const privateKey = optionalNonEmpty(optionalServerEnv("WEB_PUSH_VAPID_PRIVATE_KEY"))
  if (
    !requireTogether(
      {
        WEB_PUSH_VAPID_PUBLIC_KEY: publicKey,
        WEB_PUSH_VAPID_PRIVATE_KEY: privateKey,
      },
      "Web Push",
    )
  ) {
    return null
  }
  if (!publicKey || !privateKey) return null

  return {
    publicKey,
    privateKey,
    subject: optionalNonEmpty(optionalServerEnv("WEB_PUSH_VAPID_SUBJECT")) ?? "mailto:admin@example.com",
  }
}

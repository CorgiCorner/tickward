import "server-only"

import { formatMessage } from "@/lib/i18n/messages"

/**
 * Centralized, lazy access to server-side environment variables.
 *
 * No environment variable is read at module load time; callers read on demand
 * so build-time evaluation stays free of runtime config requirements.
 *
 * Webhook delivery is optional for self-hosted installs. Configure
 * TICKWARD_SCHEDULER_SECRET when exposing /api/internal/scheduler/tick to a
 * cron runner.
 */
export type ServerEnvVar =
  | "UPSTASH_REDIS_REST_URL"
  | "UPSTASH_REDIS_REST_TOKEN"
  | "UNSPLASH_ACCESS_KEY"
  | "DATABASE_URL"
  | "DIRECT_URL"
  | "BETTER_AUTH_URL"
  | "BETTER_AUTH_SECRET"
  | "RESEND_API_KEY"
  | "RESEND_FROM"
  | "RESEND_REPLY_TO"
  | "WEB_PUSH_VAPID_PUBLIC_KEY"
  | "WEB_PUSH_VAPID_PRIVATE_KEY"
  | "WEB_PUSH_VAPID_SUBJECT"
  | "TICKWARD_MCP_REMOTE_URL"
  | "TICKWARD_ENVIRONMENT"
  | "TICKWARD_SCHEDULER_SECRET"
  | "TICKWARD_WEBHOOK_ALLOW_PRIVATE_NETWORKS"
  | "TICKWARD_WEBHOOK_MAX_ENDPOINTS"
  | "TICKWARD_WEBHOOK_AUTO_DISABLE_FAILURES"

/**
 * Read a required environment variable, trimmed. Throws when it is absent or
 * empty after trimming.
 */
export function requireServerEnv(name: ServerEnvVar): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(formatMessage("errors.requiredEnvMissing", { name }))
  }
  return value
}

/**
 * Read an optional environment variable, trimmed. Returns undefined when it is
 * absent or empty after trimming.
 */
export function optionalServerEnv(name: ServerEnvVar): string | undefined {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

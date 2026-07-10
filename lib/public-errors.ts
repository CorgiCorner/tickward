import { formatMessage, type MessageKey, type MessageParams } from "@/lib/i18n/messages"

export const PUBLIC_ERROR_CODES = {
  authNotConfigured: "auth_not_configured",
  claimSignInRequired: "claim_sign_in_required",
  claimUnsupported: "claim_unsupported",
  invalidApiKey: "invalid_api_key",
  invalidIds: "invalid_ids",
  invalidJson: "invalid_json",
  invalidPhotoId: "invalid_photo_id",
  invalidProjectId: "invalid_project_id",
  invalidProjectPayload: "invalid_project_payload",
  invalidPushEndpoint: "invalid_push_endpoint",
  invalidPushSubscription: "invalid_push_subscription",
  invalidRestoreKey: "invalid_restore_key",
  invalidShareId: "invalid_share_id",
  invalidShareOwner: "invalid_share_owner",
  invalidSpace: "invalid_space",
  invalidTimerFields: "invalid_timer_fields",
  missingApiKey: "missing_api_key",
  missingPhotoId: "missing_photo_id",
  notFound: "not_found",
  projectReadOnly: "project_read_only",
  rateLimitUnavailable: "rate_limit_unavailable",
  rateLimited: "rate_limited",
  restrictedApiKey: "restricted_api_key",
  signInRequired: "sign_in_required",
  storageUnavailable: "storage_unavailable",
  tooManySpaces: "too_many_spaces",
  tooManyTimers: "too_many_timers",
  unsplashApi: "unsplash_api",
  unsplashNotConfigured: "unsplash_not_configured",
  webPushNotConfigured: "web_push_not_configured",
} as const

export type PublicErrorCode = (typeof PUBLIC_ERROR_CODES)[keyof typeof PUBLIC_ERROR_CODES]
export type PublicErrorDetails = MessageParams

export type PublicError = {
  code: PublicErrorCode
  messageKey: MessageKey
  details?: PublicErrorDetails
}

export type PublicErrorResponse = {
  error: PublicError
}

export class PublicClientError extends Error {
  readonly details?: PublicErrorDetails
  readonly messageKey: MessageKey

  constructor(messageKey: MessageKey, details?: PublicErrorDetails) {
    super(formatMessage(messageKey, details))
    this.name = "PublicClientError"
    this.messageKey = messageKey
    this.details = details
  }
}

export function createPublicError(
  code: PublicErrorCode,
  messageKey: MessageKey,
  details?: PublicErrorDetails,
): PublicError {
  return details ? { code, messageKey, details } : { code, messageKey }
}

export function isPublicErrorResponse(value: unknown): value is PublicErrorResponse {
  if (!value || typeof value !== "object") return false
  const error = (value as { error?: unknown }).error
  if (!error || typeof error !== "object") return false
  const anyError = error as Record<string, unknown>
  return typeof anyError.code === "string" && typeof anyError.messageKey === "string"
}

export function publicErrorMessage(error: PublicError) {
  return formatMessage(error.messageKey, error.details)
}

export function isPublicClientError(value: unknown): value is PublicClientError {
  return value instanceof PublicClientError
}

export function publicClientErrorMessage(error: unknown, fallbackMessageKey: MessageKey) {
  return isPublicClientError(error) ? formatMessage(error.messageKey, error.details) : formatMessage(fallbackMessageKey)
}

export async function publicClientErrorFromResponse(res: Response, fallbackMessageKey: MessageKey) {
  try {
    const data = (await res.clone().json()) as unknown
    if (isPublicErrorResponse(data)) return new PublicClientError(data.error.messageKey, data.error.details)
  } catch {}
  return new PublicClientError(fallbackMessageKey)
}

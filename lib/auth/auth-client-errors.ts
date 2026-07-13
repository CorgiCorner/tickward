import { formatMessage } from "@/lib/i18n/messages"

function numberProperty(value: unknown, name: string) {
  if (!value || typeof value !== "object" || !(name in value)) return null
  const numberValue = Number((value as Record<string, unknown>)[name])
  return Number.isFinite(numberValue) ? numberValue : null
}

function stringProperty(value: unknown, name: string) {
  if (!value || typeof value !== "object" || !(name in value)) return ""
  const propertyValue = (value as Record<string, unknown>)[name]
  if (typeof propertyValue === "string") return propertyValue
  // Only primitives have a meaningful string form; objects would stringify
  // as "[object Object]" and pollute the searchable error text.
  if (typeof propertyValue === "number" || typeof propertyValue === "boolean") return String(propertyValue)
  return ""
}

export function authErrorRetryAfter(error: unknown) {
  const directRetryAfter = numberProperty(error, "retryAfter")
  if (directRetryAfter) return directRetryAfter

  const details =
    error && typeof error === "object" && "details" in error ? (error as { details?: unknown }).details : null
  const detailRetryAfter = numberProperty(details, "retryAfter")
  if (detailRetryAfter) return detailRetryAfter

  const status = numberProperty(error, "status")
  return status === 429 ? 60 : null
}

export function authErrorMessage(error: unknown) {
  const status = numberProperty(error, "status")
  const message = stringProperty(error, "message")
  const code = stringProperty(error, "code")
  const statusText = stringProperty(error, "statusText")
  const searchable = `${message} ${code} ${statusText}`.toLowerCase()
  const retryAfter = authErrorRetryAfter(error)

  if (retryAfter) return formatMessage("auth.error.rateLimited", { seconds: retryAfter })
  if (
    status === 501 ||
    searchable.includes("auth_not_configured") ||
    searchable.includes("not configured") ||
    searchable.includes("not implemented")
  ) {
    return formatMessage("auth.error.unavailable")
  }
  if (message.includes("INVALID_EMAIL")) return formatMessage("auth.error.invalidEmail")
  if (message.includes("INVALID_OTP")) return formatMessage("auth.error.invalidCode")
  if (message.includes("OTP_EXPIRED")) return formatMessage("auth.error.expiredCode")
  if (message.includes("TOO_MANY_ATTEMPTS")) return formatMessage("auth.error.tooManyAttempts")
  return formatMessage("auth.error.generic")
}

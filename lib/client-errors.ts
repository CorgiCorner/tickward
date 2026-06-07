import type { MessageKey } from "@/lib/i18n/messages"
import { publicClientErrorMessage } from "@/lib/public-errors"

export function logClientError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "test") return
  console.error(`[tickward] ${context}`, error)
}

export function safeClientErrorMessage(error: unknown, fallbackMessageKey: MessageKey) {
  return publicClientErrorMessage(error, fallbackMessageKey)
}

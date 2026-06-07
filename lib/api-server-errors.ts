import "server-only"

import { apiErrorResponse } from "@/lib/api-error-response"
import { isServerPersistenceUnavailableError } from "@/lib/db/prisma.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export function publicServerErrorResponse(error: unknown): Response | null {
  if (isServerPersistenceUnavailableError(error)) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.storageUnavailable, "errors.storageUnavailable", { status: 503 })
  }

  return null
}

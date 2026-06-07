import { expect } from "vitest"

import type { MessageKey } from "@/lib/i18n/messages"
import type { PublicErrorCode } from "@/lib/public-errors"

export async function expectPublicError(res: Response, code: PublicErrorCode, messageKey: MessageKey) {
  await expect(res.json()).resolves.toEqual({
    error: expect.objectContaining({
      code,
      messageKey,
    }),
  })
}

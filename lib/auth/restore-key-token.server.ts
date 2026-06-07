import "server-only"

import { createHash } from "node:crypto"

declare const restoreKeyTokenHashBrand: unique symbol

export type RestoreKeyTokenHash = string & {
  readonly [restoreKeyTokenHashBrand]: "RestoreKeyTokenHash"
}

export function hashRestoreKeyToken(restoreKey: string): RestoreKeyTokenHash {
  return createHash("sha256").update(restoreKey, "utf8").digest("hex") as RestoreKeyTokenHash
}

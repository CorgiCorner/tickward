import { describe, expect, it } from "vitest"

import { ID_TOKEN_PATTERN } from "@/lib/identifiers"
import { PUBLIC_ID_PREFIXES, newPublicId, type PublicIdKind } from "@/lib/public-ids"

describe("newPublicId", () => {
  it("prefixes every id kind and stays URL-safe", () => {
    for (const kind of Object.keys(PUBLIC_ID_PREFIXES) as PublicIdKind[]) {
      const id = newPublicId(kind)
      expect(id.startsWith(`${PUBLIC_ID_PREFIXES[kind]}_`)).toBe(true)
      expect(id).toMatch(ID_TOKEN_PATTERN)
    }
  })

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newPublicId("timer")))
    expect(ids.size).toBe(100)
  })
})

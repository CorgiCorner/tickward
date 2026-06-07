import { describe, expect, it } from "vitest"

import {
  dismissProjectClaim,
  isProjectClaimDismissed,
  PROJECT_CLAIM_DISMISS_MS,
} from "@/lib/project-claim-dismissal.client"

describe("project claim dismissal", () => {
  it("keeps the claim prompt hidden for two weeks", () => {
    const storage = new Map<string, string>()
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }
    const nowMs = Date.UTC(2026, 5, 6, 12)

    dismissProjectClaim("project-a", nowMs, storageLike)

    expect(isProjectClaimDismissed("project-a", nowMs + PROJECT_CLAIM_DISMISS_MS - 1, storageLike)).toBe(true)
    expect(isProjectClaimDismissed("project-a", nowMs + PROJECT_CLAIM_DISMISS_MS, storageLike)).toBe(false)
    expect(isProjectClaimDismissed("project-b", nowMs + 1, storageLike)).toBe(false)
  })
})

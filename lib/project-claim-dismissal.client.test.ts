import { describe, expect, it } from "vitest"

import { dismissProjectClaim, isProjectClaimDismissed } from "@/lib/project-claim-dismissal.client"

describe("project claim dismissal", () => {
  it("keeps the claim prompt hidden in the current storage session", () => {
    const storage = new Map<string, string>()
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }

    dismissProjectClaim("project-a", storageLike)

    expect(isProjectClaimDismissed("project-a", storageLike)).toBe(true)
    expect(
      isProjectClaimDismissed("project-a", {
        getItem: () => null,
        setItem: () => {},
      }),
    ).toBe(false)
    expect(isProjectClaimDismissed("project-b", storageLike)).toBe(false)
  })
})

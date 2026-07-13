import { describe, expect, it } from "vitest"

import { isValidEmailAddress } from "@/lib/email-address"

describe("isValidEmailAddress", () => {
  it.each(["ada@example.com", "first.last+tag@example.co.uk", "a@b..c"])("accepts %s", (email) => {
    expect(isValidEmailAddress(email)).toBe(true)
  })

  it.each([
    "",
    "ada",
    "@example.com",
    "ada@",
    "ada@@example.com",
    "ada @example.com",
    "ada@example",
  ])("rejects %s", (email) => {
    expect(isValidEmailAddress(email)).toBe(false)
  })

  it("rejects adversarial long input in a single pass", () => {
    expect(isValidEmailAddress(`${"a".repeat(100_000)}@example`)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"

import { parseAgentReadyScore } from "./smoke-agent-ready.mjs"

describe("parseAgentReadyScore", () => {
  it("reads a score for the exact normalized target URL", () => {
    expect(parseAgentReadyScore("RESULTS FOR https://tickward.com/ 100 LEVEL 4", "https://tickward.com")).toBe(100)
  })

  it.each([
    "https://tickward.com.attacker.example",
    "https://tickward.com@attacker.example",
    "https://attacker.example/?next=https://tickward.com",
  ])("rejects an attacker URL containing the expected target: %s", (attackerUrl) => {
    const text = `RESULTS FOR ${attackerUrl} 100 LEVEL 4`

    expect(parseAgentReadyScore(text, "https://tickward.com")).toBeNull()
  })

  it("ignores unrelated scores elsewhere in the response", () => {
    const text = "RESULTS FOR https://attacker.example 100 LEVEL 4 other score 100 LEVEL 4"

    expect(parseAgentReadyScore(text, "https://tickward.com")).toBeNull()
  })

  it("rejects malformed scores and unsupported target protocols", () => {
    expect(parseAgentReadyScore("RESULTS FOR https://tickward.com NaN LEVEL 4", "https://tickward.com")).toBeNull()
    expect(() => parseAgentReadyScore("RESULTS FOR file:///tmp/site 100 LEVEL 4", "file:///tmp/site")).toThrow(
      "HTTP(S)",
    )
  })
})

import { describe, expect, it } from "vitest"

import { EMBED_STATES, deriveEmbedState } from "./embed-state"

const nowMs = Date.parse("2026-06-11T12:00:00.000Z")

describe("deriveEmbedState", () => {
  it("returns counting for a future target", () => {
    expect(deriveEmbedState("2026-06-11T12:00:01.000Z", nowMs)).toBe("counting")
    expect(deriveEmbedState("2028-01-01T00:00:00.000Z", nowMs)).toBe("counting")
  })

  it("returns since for a past target", () => {
    expect(deriveEmbedState("2026-06-11T11:59:59.000Z", nowMs)).toBe("since")
    expect(deriveEmbedState("2020-01-01T00:00:00.000Z", nowMs)).toBe("since")
  })

  it("returns since when the target is exactly now", () => {
    expect(deriveEmbedState("2026-06-11T12:00:00.000Z", nowMs)).toBe("since")
  })

  it("returns since for an unparseable target date", () => {
    expect(deriveEmbedState("not-a-date", nowMs)).toBe("since")
    expect(deriveEmbedState("", nowMs)).toBe("since")
  })

  it("only emits states from the contract enum", () => {
    for (const target of ["2028-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z", "nope"]) {
      expect(EMBED_STATES).toContain(deriveEmbedState(target, nowMs))
    }
  })
})

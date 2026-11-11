import { afterEach, describe, expect, it } from "vitest"

import {
  createLocalMomentLedger,
  createMemoryMomentLedger,
  MOMENT_LEDGER_STORAGE_KEY,
  momentKey,
} from "@/components/dashboard/milestone-moment-ledger"

const DAY_MS = 86_400_000
const NOW = Date.parse("2026-11-10T12:00:00.000Z")

afterEach(() => {
  localStorage.clear()
})

describe("milestone moment ledger", () => {
  it("names a moment by surface, timer and milestone value", () => {
    expect(momentKey("card", "met", { unit: "days", count: 1300 })).toBe("card|met|days|1300")
    expect(momentKey("dial", "met", { unit: "days", count: 1300 })).not.toBe(
      momentKey("detail", "met", { unit: "days", count: 1300 }),
    )
  })

  it("lets each moment play once on this device, across reloads", () => {
    const key = momentKey("detail", "met", { unit: "years", count: 3 })
    const first = createLocalMomentLedger()
    expect(first.has(key)).toBe(false)
    expect(first.claim(key, NOW)).toBe(true)
    expect(first.claim(key, NOW)).toBe(false)

    const afterReload = createLocalMomentLedger()
    expect(afterReload.has(key)).toBe(true)
    expect(afterReload.claim(key, NOW)).toBe(false)
  })

  it("keeps surfaces apart: the card playing does not use up the detail view", () => {
    const ledger = createMemoryMomentLedger()
    expect(ledger.claim(momentKey("card", "met", { unit: "years", count: 3 }), NOW)).toBe(true)
    expect(ledger.claim(momentKey("detail", "met", { unit: "years", count: 3 }), NOW)).toBe(true)
  })

  it("forgets moments older than a few days", () => {
    const old = momentKey("card", "old", { unit: "days", count: 100 })
    createLocalMomentLedger().claim(old, NOW - 4 * DAY_MS)
    createLocalMomentLedger().claim(momentKey("card", "new", { unit: "days", count: 200 }), NOW)
    expect(Object.keys(JSON.parse(localStorage.getItem(MOMENT_LEDGER_STORAGE_KEY) ?? "{}"))).toEqual([
      "card|new|days|200",
    ])
  })
})

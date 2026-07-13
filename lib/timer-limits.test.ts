import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getEntitlements: vi.fn(),
  timerLimitMessage: vi.fn(() => "limit"),
}))

vi.mock("@/lib/entitlements", () => ({
  getEntitlements: mocks.getEntitlements,
  timerLimitMessage: mocks.timerLimitMessage,
}))

import { timerLimitMessage, timerLimitWarningMessage, timerWarnThreshold } from "@/lib/timer-limits"

describe("timer limit compatibility helpers", () => {
  beforeEach(() => {
    mocks.getEntitlements.mockReset().mockReturnValue({ maxTimers: 8, plan: "anonymous" })
    mocks.timerLimitMessage.mockClear()
  })

  it.each([
    ["threshold", () => timerWarnThreshold()],
    ["limit message", () => timerLimitMessage()],
    ["warning message", () => timerLimitWarningMessage(6)],
  ])("reads the active entitlements once for %s", (_label, invoke) => {
    invoke()
    expect(mocks.getEntitlements).toHaveBeenCalledTimes(1)
  })

  it("does not read active entitlements when an explicit maximum is supplied", () => {
    expect(timerWarnThreshold(12)).toBe(9)
    expect(timerLimitWarningMessage(9, 12)).toContain("9")
    expect(mocks.getEntitlements).not.toHaveBeenCalled()
  })
})

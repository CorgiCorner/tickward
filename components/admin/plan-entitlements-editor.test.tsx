import { fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { defaultEntitlementsTable } from "@/lib/entitlements"

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), updatePlanEntitlements: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock("@/app/[locale]/admin/actions", () => ({
  updatePlanEntitlements: mocks.updatePlanEntitlements,
}))

import { PlanEntitlementsEditor } from "./plan-entitlements-editor"

describe("PlanEntitlementsEditor", () => {
  beforeEach(() => {
    mocks.refresh.mockReset()
    mocks.updatePlanEntitlements.mockReset()
  })

  it("replaces stale form state when refreshed entitlements change", () => {
    const defaults = defaultEntitlementsTable()
    const initial = defaultEntitlementsTable()
    const { rerender } = render(<PlanEntitlementsEditor defaults={defaults} entitlements={initial} />)
    const input = document.querySelector<HTMLInputElement>("#anonymous-maxTimers")
    expect(input).not.toBeNull()

    fireEvent.change(input as HTMLInputElement, { target: { value: "99" } })
    expect(input).toHaveValue(99)

    const refreshed = defaultEntitlementsTable()
    refreshed.anonymous.maxTimers = 12
    rerender(<PlanEntitlementsEditor defaults={defaults} entitlements={refreshed} />)

    expect(document.querySelector("#anonymous-maxTimers")).toHaveValue(12)
  })
})

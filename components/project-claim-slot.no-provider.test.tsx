import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ProjectClaimSlot } from "@/components/project-claim-slot"
import type { TimerStore } from "@/lib/store"

// Regression for the home-page crash "useTimerStore must be used within
// TimerStoreProvider". The project-claim toast renders ProjectClaimSlot inside
// Sonner's portal, which lives in the root layout ABOVE the home page's
// TimerStoreProvider, so ProjectClaimSlot must never call useTimerStore itself.
//
// Unlike the sibling suite, this file does NOT mock "@/lib/store": it loads the
// REAL store module and renders the component with NO provider. Before the fix
// (ProjectClaimSlot read the store directly) this threw on render.

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { email: "ada@example.com" } }, isPending: false, error: null }),
  },
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn(), custom: vi.fn() },
}))

vi.mock("@/lib/client-errors", () => ({ logClientError: vi.fn() }))

const claimActiveProject = vi.fn(async () => "claimed") as unknown as TimerStore["claimActiveProject"]

describe("ProjectClaimSlot rendered outside a TimerStoreProvider", () => {
  it("renders without a provider because it takes the store action as a prop", () => {
    expect(() =>
      render(
        <ProjectClaimSlot
          claimActiveProject={claimActiveProject}
          restoreKey="restoreKey_123"
          projectName="Alpha"
          variant="button"
        />,
      ),
    ).not.toThrow()

    expect(screen.getByRole("button", { name: "Save to account" })).toBeVisible()
  })
})

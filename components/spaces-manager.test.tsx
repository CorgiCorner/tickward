import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SpacesManager } from "@/components/spaces-manager"
import type { TimerStore } from "@/lib/store"
import { makeSpace } from "@/test/factories"

let storeState: Partial<TimerStore>

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

describe("SpacesManager", () => {
  beforeEach(() => {
    storeState = {
      spaces: [makeSpace({ id: "space-a" })],
      updateSpace: vi.fn(),
      deleteSpace: vi.fn(),
      reorderSpaces: vi.fn(),
    }
  })

  it("saves a renamed space on blur without a separate confirm button", async () => {
    const user = userEvent.setup()
    render(<SpacesManager />)

    const nameInput = screen.getByLabelText("Work")
    await user.clear(nameInput)
    await user.type(nameInput, "Personal")
    await user.tab()

    expect(storeState.updateSpace).toHaveBeenCalledWith("space-a", { name: "Personal" })
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument()
  })
})

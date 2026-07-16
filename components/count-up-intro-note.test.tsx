import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CountUpIntroNote } from "@/components/count-up-intro-note"
import { DEFAULT_ACCOUNT_PREFERENCES, type AccountPreferencesRecord } from "@/lib/account-preferences"
import { LOCAL_COUNT_UP_INTRO_DISMISSED_KEY } from "@/lib/local-count-up-intro.client"

let signedIn = false
let preferences: AccountPreferencesRecord
const updatePreferences = vi.fn()

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: signedIn ? { user: { id: "user-1" } } : null, isPending: false }),
  },
}))

vi.mock("@/components/account-preferences-provider", () => ({
  useAccountPreferences: () => ({ loading: false, preferences, updatePreferences }),
}))

vi.mock("next/navigation", () => ({ usePathname: () => "/en" }))

describe("CountUpIntroNote", () => {
  beforeEach(() => {
    signedIn = false
    preferences = DEFAULT_ACCOUNT_PREFERENCES
    updatePreferences.mockReset()
    updatePreferences.mockResolvedValue(DEFAULT_ACCOUNT_PREFERENCES)
  })

  it("shows exact first-use copy, links to global behavior settings, and persists anonymous dismissal", async () => {
    const user = userEvent.setup()
    render(<CountUpIntroNote />)

    expect(
      screen.getByText("Count-up timers stay at the top after reaching zero until you acknowledge them."),
    ).toBeVisible()
    expect(screen.getByRole("link", { name: "Change behavior" })).toHaveAttribute("href", "/en/settings#count-up")

    await user.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByText(/Timers stay here/)).not.toBeInTheDocument()
    expect(localStorage.getItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY)).toBe("1")
  })

  it("persists signed-in dismissal without writing anonymous storage", async () => {
    const user = userEvent.setup()
    signedIn = true
    render(<CountUpIntroNote />)

    await user.click(screen.getByRole("button", { name: "Dismiss" }))

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ count_up_intro_dismissed: true }))
    expect(localStorage.getItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY)).toBeNull()
  })

  it("stays hidden after dismissal", () => {
    localStorage.setItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY, "1")
    render(<CountUpIntroNote />)
    expect(screen.queryByText(/Timers stay here/)).not.toBeInTheDocument()
  })
})

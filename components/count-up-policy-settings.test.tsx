import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CountUpPolicySettings } from "@/components/count-up-policy-settings"
import { DEFAULT_ACCOUNT_PREFERENCES, type AccountPreferencesRecord } from "@/lib/account-preferences"
import { LOCAL_COUNT_UP_POLICY_STORAGE_KEY } from "@/lib/local-count-up-policy.client"
import type { TimerStore } from "@/lib/store"

let signedIn = false
let preferences: AccountPreferencesRecord
const updatePreferences = vi.fn()
const setCountUpPolicy = vi.fn()
const syncCountUpOccurrences = vi.fn()
const analyticsTrack = vi.hoisted(() => vi.fn())

vi.mock("@/components/plausible-analytics", () => ({ trackCountUpAnalyticsEvent: analyticsTrack }))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: signedIn ? { user: { id: "user-1" } } : null, isPending: false }),
  },
}))

vi.mock("@/components/account-preferences-provider", () => ({
  useAccountPreferences: () => ({ loading: false, preferences, saving: false, updatePreferences }),
}))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) =>
    selector({ setCountUpPolicy, syncCountUpOccurrences } as unknown as TimerStore),
}))

describe("CountUpPolicySettings", () => {
  beforeEach(() => {
    signedIn = false
    preferences = DEFAULT_ACCOUNT_PREFERENCES
    updatePreferences.mockReset()
    updatePreferences.mockResolvedValue(DEFAULT_ACCOUNT_PREFERENCES)
    setCountUpPolicy.mockReset()
    syncCountUpOccurrences.mockReset()
    syncCountUpOccurrences.mockResolvedValue(undefined)
    analyticsTrack.mockReset()
  })

  it("shows the exact helper and persists an anonymous policy locally", async () => {
    const user = userEvent.setup()
    render(<CountUpPolicySettings />)

    expect(screen.getByLabelText("Keep in Review")).toBeVisible()
    expect(screen.getByText("Timers stay in Review until you acknowledge them.")).toBeVisible()
    expect(
      screen.getByText("Applies to one-off timers. Repeating timers continue to their next occurrence."),
    ).toBeVisible()

    await user.click(screen.getByRole("combobox", { name: "Keep in Review" }))
    await user.click(screen.getByRole("option", { name: "Keep for 15 minutes" }))

    expect(
      screen.getByText(
        "The 15 minutes start when the timer is first shown to you — timers you haven't seen yet stay in Review. Changing this restarts the countdown for timers already counting.",
      ),
    ).toBeVisible()

    const expected = { mode: "after-seen-15m", minutes: null }
    expect(setCountUpPolicy).toHaveBeenCalledWith(expected)
    expect(analyticsTrack).toHaveBeenCalledWith("transition_policy_changed", {
      policy: "after-seen-15m",
      sectionSize: 0,
    })
    expect(JSON.parse(localStorage.getItem(LOCAL_COUNT_UP_POLICY_STORAGE_KEY) ?? "null")).toEqual(expected)
    expect(updatePreferences).not.toHaveBeenCalled()
  })

  it("validates custom minutes before persisting them", async () => {
    const user = userEvent.setup()
    render(<CountUpPolicySettings />)

    await user.click(screen.getByRole("combobox", { name: "Keep in Review" }))
    await user.click(screen.getByRole("option", { name: "Keep for a custom time" }))
    setCountUpPolicy.mockClear()
    const minutes = screen.getByLabelText("Minutes")
    await user.clear(minutes)
    fireEvent.blur(minutes)

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a whole number of minutes from 1 to 525600.")
    expect(setCountUpPolicy).not.toHaveBeenCalled()

    await user.type(minutes, "45")
    fireEvent.blur(minutes)
    expect(setCountUpPolicy).toHaveBeenCalledWith({ mode: "custom", minutes: 45 })
  })

  it("renders persisted custom minutes and saves signed-in changes through account preferences", async () => {
    const user = userEvent.setup()
    signedIn = true
    const view = render(<CountUpPolicySettings />)

    preferences = { ...DEFAULT_ACCOUNT_PREFERENCES, count_up_policy: { mode: "custom", minutes: 45 } }
    updatePreferences.mockResolvedValue(preferences)
    view.rerender(<CountUpPolicySettings />)

    expect(screen.getByLabelText("Minutes")).toHaveValue(45)
    await user.clear(screen.getByLabelText("Minutes"))
    await user.type(screen.getByLabelText("Minutes"), "4")
    view.rerender(<CountUpPolicySettings />)
    expect(screen.getByLabelText("Minutes")).toHaveValue(4)

    await user.click(screen.getByRole("combobox", { name: "Keep in Review" }))
    await user.click(screen.getByRole("option", { name: "Keep for 1 hour" }))

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({
        count_up_policy: { mode: "after-seen-1h", minutes: null },
      }),
    )
    expect(setCountUpPolicy).toHaveBeenCalledWith({ mode: "after-seen-1h", minutes: null })
    expect(syncCountUpOccurrences).toHaveBeenCalled()
    expect(analyticsTrack).toHaveBeenCalledWith("transition_policy_changed", {
      policy: "after-seen-1h",
      sectionSize: 0,
    })
    expect(localStorage.getItem(LOCAL_COUNT_UP_POLICY_STORAGE_KEY)).toBeNull()
  })
})

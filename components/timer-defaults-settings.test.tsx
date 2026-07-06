import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TimerDefaultsSettingsPanel } from "@/components/timer-defaults-settings"

const mocks = vi.hoisted(() => ({
  accountState: {
    error: null as string | null,
    loading: false,
    preferences: {
      default_timezone: "UTC",
    },
    saving: false,
  },
  updatePreferences: vi.fn(),
}))

vi.mock("@/components/account-preferences-provider", () => ({
  useAccountPreferences: () => ({
    ...mocks.accountState,
    updatePreferences: mocks.updatePreferences,
  }),
}))

vi.mock("@/components/timezone-select", () => ({
  TimezoneSelect: (props: { disabled?: boolean; value: string; onChange: (value: string) => void }) => (
    <select
      aria-label="Default timezone"
      disabled={props.disabled}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="UTC">UTC</option>
      <option value="America/New_York">America/New_York</option>
      <option value="Europe/Warsaw">Europe/Warsaw</option>
    </select>
  ),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}))

describe("TimerDefaultsSettingsPanel", () => {
  beforeEach(() => {
    localStorage.clear()
    Object.assign(mocks.accountState, {
      error: null,
      loading: false,
      preferences: {
        default_timezone: "UTC",
      },
      saving: false,
    })
    mocks.updatePreferences.mockReset()
    mocks.updatePreferences.mockResolvedValue({
      object: "account_preferences",
      default_timezone: null,
      email_reminders: false,
      full_page_alarm: false,
      in_app_notifications: true,
      notification_sound: "none",
    })
    vi.mocked(toast.success).mockReset()
  })

  it("saves the account default timezone used by new timers", async () => {
    const user = userEvent.setup()
    render(<TimerDefaultsSettingsPanel />)

    await user.selectOptions(screen.getByLabelText("Default timezone"), "America/New_York")

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ default_timezone: "America/New_York" })
    expect(toast.success).toHaveBeenCalledWith("Default timezone saved.")
  })

  it("keeps timezone controls usable after a previous settings error", async () => {
    const user = userEvent.setup()
    mocks.accountState.error = "We couldn't update your settings."
    render(<TimerDefaultsSettingsPanel />)

    expect(screen.getByLabelText("Default timezone")).toBeEnabled()

    await user.selectOptions(screen.getByLabelText("Default timezone"), "Europe/Warsaw")

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ default_timezone: "Europe/Warsaw" })
  })

  it("can reset the account default timezone to the browser timezone", async () => {
    const user = userEvent.setup()
    render(<TimerDefaultsSettingsPanel />)

    await user.click(screen.getByRole("button", { name: "Use browser timezone" }))

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ default_timezone: null })
    expect(toast.success).toHaveBeenCalledWith("Default timezone reset.")
  })
})

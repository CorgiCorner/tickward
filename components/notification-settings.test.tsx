import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationSettingsPanel } from "@/components/notification-settings"

const mocks = vi.hoisted(() => ({
  accountState: {
    error: null as string | null,
    loading: false,
    preferences: {
      browser_notifications_enabled: false,
      full_page_alarm: false,
      notification_sound: "none" as const,
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

vi.mock("@/lib/notification-audio.client", () => ({
  playNotificationSound: vi.fn().mockResolvedValue(true),
  unlockNotificationAudio: vi.fn().mockResolvedValue(true),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe("NotificationSettingsPanel", () => {
  beforeEach(() => {
    localStorage.clear()
    Object.assign(mocks.accountState, {
      error: null,
      loading: false,
      preferences: {
        browser_notifications_enabled: false,
        full_page_alarm: false,
        notification_sound: "none",
      },
      saving: false,
    })
    mocks.updatePreferences.mockReset()
    mocks.updatePreferences.mockResolvedValue({
      object: "account_preferences",
      browser_notifications_enabled: false,
      default_timezone: null,
      full_page_alarm: false,
      notification_sound: "none",
    })
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it("keeps account local alarms usable when browser notification permission is denied", async () => {
    const user = userEvent.setup()
    const requestPermission = vi.fn().mockResolvedValue("denied" satisfies NotificationPermission)
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: {
        permission: "default",
        requestPermission,
      },
    })

    render(<NotificationSettingsPanel />)

    expect(screen.getByRole("heading", { name: "System alerts" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Local alarms" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Enable alerts" }))

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(mocks.updatePreferences).toHaveBeenCalledWith({ browser_notifications_enabled: false })
    expect(toast.error).toHaveBeenCalledWith("Use local alarms, or allow browser notifications in your browser.")

    await user.click(screen.getByLabelText("Full-page alarm"))
    await user.click(screen.getByRole("button", { name: "Polite" }))

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ full_page_alarm: true })
    expect(mocks.updatePreferences).toHaveBeenCalledWith({ notification_sound: "polite" })
    const audio = await import("@/lib/notification-audio.client")
    expect(audio.unlockNotificationAudio).toHaveBeenCalledWith("polite")
  })

  it("keeps local alarm controls usable after a previous settings error", async () => {
    const user = userEvent.setup()
    mocks.accountState.error = "We couldn't update your settings."

    render(<NotificationSettingsPanel />)

    expect(screen.getByLabelText("Full-page alarm")).toBeEnabled()

    await user.click(screen.getByLabelText("Full-page alarm"))

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ full_page_alarm: true })
  })
})

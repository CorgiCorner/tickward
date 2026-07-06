import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationSettingsPanel } from "@/components/notification-settings"
import { LOCAL_NOTIFICATION_STORAGE_KEYS } from "@/lib/notification-preferences"
import type { NotificationSound } from "@/lib/notification-preferences"

const mocks = vi.hoisted(() => ({
  accountState: {
    error: null as string | null,
    loading: false,
    preferences: {
      email_reminders: false,
      full_page_alarm: false,
      in_app_notifications: true,
      notification_sound: "none" as NotificationSound,
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
        email_reminders: false,
        full_page_alarm: false,
        in_app_notifications: true,
        notification_sound: "none",
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

    expect(screen.getByRole("heading", { name: "Device notifications" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Alarm defaults" })).toBeVisible()
    expect(screen.getByLabelText("In-app notifications")).toBeChecked()
    expect(screen.getByLabelText("Email reminders")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Enable on this device" }))

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(LOCAL_NOTIFICATION_STORAGE_KEYS.enabled)).toBe("0")
    expect(mocks.updatePreferences).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("Browser notifications were denied. Local alarms still work while open.")

    await user.click(screen.getByLabelText("Full-page alarm"))
    await user.click(screen.getByRole("button", { name: "Polite" }))

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ full_page_alarm: true })
    expect(mocks.updatePreferences).toHaveBeenCalledWith({ notification_sound: "polite" })
    const audio = await import("@/lib/notification-audio.client")
    expect(audio.playNotificationSound).not.toHaveBeenCalled()
  })

  it("updates the email reminders account preference", async () => {
    const user = userEvent.setup()

    render(<NotificationSettingsPanel />)

    await user.click(screen.getByLabelText("Email reminders"))

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ email_reminders: true })
  })

  it("persists the in-app notifications master preference", async () => {
    const user = userEvent.setup()

    render(<NotificationSettingsPanel />)

    const toggle = screen.getByLabelText("In-app notifications")
    expect(toggle).toBeChecked()

    await user.click(toggle)

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ in_app_notifications: false })
  })

  it("disables device notifications without changing account defaults", async () => {
    const user = userEvent.setup()
    localStorage.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.enabled, "1")
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: {
        permission: "granted",
        requestPermission: vi.fn(),
      },
    })

    render(<NotificationSettingsPanel />)

    await user.click(screen.getByRole("button", { name: "Disable on this device" }))

    expect(localStorage.getItem(LOCAL_NOTIFICATION_STORAGE_KEYS.enabled)).toBe("0")
    expect(mocks.updatePreferences).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith("Device notifications disabled.")
  })

  it("previews the active sound without playing on selection", async () => {
    const user = userEvent.setup()
    mocks.accountState.preferences.notification_sound = "polite"

    render(<NotificationSettingsPanel />)

    await user.click(screen.getByRole("button", { name: "Preview sound" }))

    const audio = await import("@/lib/notification-audio.client")
    expect(audio.playNotificationSound).toHaveBeenCalledWith("polite")
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

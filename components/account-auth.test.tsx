import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountMenuLinksProvider } from "@/components/account-button"
import { AccountButton, AccountPageClient } from "@/components/account-auth"
import { TooltipProvider } from "@/components/ui/tooltip"
import { LOCAL_NOTIFICATION_STORAGE_KEYS } from "@/lib/notification-preferences"

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  removeAccountProjectsFromDevice: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: mocks.useSession,
    signOut: mocks.signOut,
    updateUser: mocks.updateUser,
  },
}))

vi.mock("@/components/account-preferences-provider", () => ({
  AccountPreferencesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAccountPreferences: () => ({
    error: null,
    loading: false,
    preferences: {
      default_timezone: "UTC",
    },
    refreshPreferences: vi.fn(),
    saving: false,
    updatePreferences: vi.fn(),
  }),
}))

vi.mock("@/components/api-keys-settings", () => ({
  ApiKeysSettingsPanel: () => <section id="api-keys">API keys</section>,
}))

vi.mock("@/components/mcp-settings", () => ({
  McpSettingsPanel: ({ remoteUrl }: { remoteUrl?: string | null }) => (
    <section id="mcp">MCP {remoteUrl ? "configured" : "not configured"}</section>
  ),
}))

vi.mock("@/components/webhooks-settings", () => ({
  WebhooksSettingsPanel: () => <section id="webhooks">Webhooks</section>,
}))

vi.mock("@/components/notification-settings", () => ({
  NotificationSettingsPanel: () => (
    <section id="notifications">
      <div id="alerts">Alert settings</div>
    </section>
  ),
}))

vi.mock("@/components/timer-defaults-settings", () => ({
  DefaultTimezoneSettingsRow: () => <div id="defaults">Default timezone</div>,
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: { removeAccountProjectsFromDevice: () => void }) => T) =>
    selector({ removeAccountProjectsFromDevice: mocks.removeAccountProjectsFromDevice }),
}))

function renderWithTooltips(ui: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)
}

describe("AccountButton", () => {
  beforeEach(() => {
    mocks.useSession.mockReset()
    mocks.useSession.mockReturnValue({ data: null })
    mocks.signOut.mockReset()
    mocks.signOut.mockResolvedValue({ data: {}, error: null })
    mocks.removeAccountProjectsFromDevice.mockReset()
    mocks.refetch.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  it("opens the sign-in dialog for anonymous users", async () => {
    const user = userEvent.setup()
    renderWithTooltips(<AccountButton />)

    const trigger = screen.getByRole("button", { name: "Sign in" })
    await user.click(trigger)

    expect(screen.getByRole("dialog")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible()
    expect(screen.getByLabelText("Email")).toBeVisible()
  })

  it("opens an account popover for signed-in users", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({
      data: { user: { name: "Ada Lovelace", email: "ada@example.com" } },
      refetch: mocks.refetch,
    })

    renderWithTooltips(<AccountButton />)

    const trigger = screen.getByRole("button", { name: "Open account menu" })
    expect(trigger).toHaveTextContent("AL")
    expect(trigger).not.toHaveTextContent("Account")

    await user.click(trigger)

    expect(screen.getAllByText("AL")).toHaveLength(2)
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/en/settings")
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible()
  })

  it("shows provided account menu links when the user role matches", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({
      data: { user: { name: "Ada Lovelace", email: "ada@example.com", role: "admin" } },
      refetch: mocks.refetch,
    })

    renderWithTooltips(
      <AccountMenuLinksProvider value={[{ href: "/en/admin", label: "Admin", requiredRole: "admin" }]}>
        <AccountButton />
      </AccountMenuLinksProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Open account menu" }))

    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/en/admin")
  })

  it("hides provided account menu links when the user role does not match", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({
      data: { user: { name: "Ada Lovelace", email: "ada@example.com", role: "user" } },
      refetch: mocks.refetch,
    })

    renderWithTooltips(
      <AccountMenuLinksProvider value={[{ href: "/en/admin", label: "Admin", requiredRole: "admin" }]}>
        <AccountButton />
      </AccountMenuLinksProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Open account menu" }))

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument()
  })

  it("renders no extra account menu links when the provider is empty", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({
      data: { user: { name: "Ada Lovelace", email: "ada@example.com", role: "admin" } },
      refetch: mocks.refetch,
    })

    renderWithTooltips(
      <AccountMenuLinksProvider value={[]}>
        <AccountButton />
      </AccountMenuLinksProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Open account menu" }))

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument()
  })

  it("signs out from the account popover", async () => {
    const user = userEvent.setup()
    localStorage.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.inAppNotifications, "0")
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })

    renderWithTooltips(<AccountButton />)

    await user.click(screen.getByRole("button", { name: "Open account menu" }))
    await user.click(screen.getByRole("button", { name: "Sign out" }))

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
    expect(mocks.removeAccountProjectsFromDevice).toHaveBeenCalledTimes(1)
    // The account-level in-app master toggle mirror resets to the signed-out
    // default so local-only use is not silently suppressed afterwards.
    expect(localStorage.getItem(LOCAL_NOTIFICATION_STORAGE_KEYS.inAppNotifications)).toBe("1")
    expect(mocks.refetch).toHaveBeenCalled()
  })
})

describe("AccountPageClient", () => {
  beforeEach(() => {
    mocks.useSession.mockReset()
    mocks.useSession.mockReturnValue({ data: null, refetch: mocks.refetch })
    mocks.signOut.mockReset()
    mocks.signOut.mockResolvedValue({ data: {}, error: null })
    mocks.updateUser.mockReset()
    mocks.updateUser.mockResolvedValue({ data: { user: { name: "Ada Lovelace" } }, error: null })
    mocks.refetch.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
    localStorage.clear()
    window.history.replaceState(null, "", "/")
  })

  it("points anonymous users to sign in instead of showing inline OTP", () => {
    render(<AccountPageClient />)

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/sign-in")
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument()
  })

  it("shows a neutral account loading state while the session is pending", () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: true, refetch: mocks.refetch })
    render(<AccountPageClient />)

    expect(screen.getByText("Checking account...")).toBeVisible()
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument()
  })

  it("updates the signed-in user's profile name", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({
      data: { user: { name: "Ada", email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    render(<AccountPageClient />)

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible()
    const name = screen.getByLabelText("Name")
    await user.clear(name)
    await user.type(name, "Ada Lovelace")
    await user.tab()

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ name: "Ada Lovelace" }))
    expect(mocks.refetch).toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Profile saved.")
  })

  it("treats provider placeholder names as missing profile names", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { name: "undefined undefined", email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    render(<AccountPageClient />)

    expect(screen.queryByText("undefined undefined")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("")
    expect(screen.getByText("ada@example.com")).toBeVisible()
  })

  it("signs out from account settings", async () => {
    const user = userEvent.setup()
    localStorage.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.inAppNotifications, "0")
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    render(<AccountPageClient />)

    expect(screen.getByText("ada@example.com")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Sign out" }))

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
    expect(mocks.removeAccountProjectsFromDevice).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(LOCAL_NOTIFICATION_STORAGE_KEYS.inAppNotifications)).toBe("1")
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it("orders settings sections from account to developer", async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    render(<AccountPageClient mcpRemoteUrl="https://mcp.example.com/mcp" />)

    const account = document.getElementById("account")
    const profile = document.getElementById("profile")
    const defaults = document.getElementById("defaults")
    const notifications = document.getElementById("notifications")
    const alerts = document.getElementById("alerts")
    const developer = document.getElementById("developer")
    const apiKeys = document.getElementById("api-keys")
    const webhooks = document.getElementById("webhooks")
    const mcp = document.getElementById("mcp")

    expect(account).not.toBeNull()
    expect(profile).not.toBeNull()
    expect(defaults).not.toBeNull()
    expect(notifications).not.toBeNull()
    expect(alerts).not.toBeNull()
    expect(developer).not.toBeNull()
    expect(apiKeys).not.toBeNull()
    expect(webhooks).not.toBeNull()
    expect(mcp).not.toBeNull()
    expect(profile!.compareDocumentPosition(defaults!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(defaults!.compareDocumentPosition(notifications!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(alerts!.compareDocumentPosition(developer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(apiKeys!.compareDocumentPosition(webhooks!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(webhooks!.compareDocumentPosition(mcp!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(await screen.findByText("MCP configured")).toBeVisible()
  })

  it("normalizes and scrolls to settings hash sections after render", async () => {
    const scrollIntoView = vi.fn()
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    window.history.replaceState(null, "", "/settings#alerts#alerts")
    Element.prototype.scrollIntoView = scrollIntoView

    render(<AccountPageClient />)

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" }))
    expect(window.location.hash).toBe("#alerts")
  })

  it("smooth-scrolls and syncs the active nav tab when the hash changes", async () => {
    const scrollIntoView = vi.fn()
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    window.history.replaceState(null, "", "/settings")
    Element.prototype.scrollIntoView = scrollIntoView

    render(<AccountPageClient />)

    window.location.hash = "#alerts"
    window.dispatchEvent(new HashChangeEvent("hashchange"))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" }))
    const notificationsTab = screen.getByRole("link", { name: "Notifications" })
    await waitFor(() => expect(notificationsTab.className).toContain("border-foreground"))
  })

  it("smooth-scrolls to the section when a nav tab is clicked", async () => {
    const scrollIntoView = vi.fn()
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    window.history.replaceState(null, "", "/settings")
    Element.prototype.scrollIntoView = scrollIntoView

    render(<AccountPageClient />)

    await userEvent.click(screen.getByRole("link", { name: "Developer" }))

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" })
    expect(window.location.hash).toBe("#developer")
    const developerTab = screen.getByRole("link", { name: "Developer" })
    expect(developerTab.className).toContain("border-foreground")
  })
})

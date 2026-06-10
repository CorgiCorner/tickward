import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKeysSettingsPanel, type ApiKeyRecord } from "@/components/api-keys-settings"

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: toastMocks,
}))

function apiKey(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: "key_123",
    object: "api_key",
    name: "Production",
    permission: "read",
    key_prefix: "tw_abcd",
    key_last4: "wxyz",
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
    last_used_at: null,
    revoked_at: null,
    ...overrides,
  }
}

describe("ApiKeysSettingsPanel", () => {
  beforeEach(() => {
    toastMocks.error.mockReset()
    toastMocks.success.mockReset()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
    vi.stubGlobal("fetch", vi.fn())
  })

  it("loads and renders active API keys", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ object: "list", data: [apiKey()] }))

    render(<ApiKeysSettingsPanel />)

    expect(await screen.findByText("Production")).toBeVisible()
    expect(screen.getByText("tw_abcd...wxyz")).toBeVisible()
    expect(screen.getByText("Read")).toBeVisible()
  })

  it("renders server-loaded API keys without fetching on mount", () => {
    render(<ApiKeysSettingsPanel initialApiKeys={[apiKey({ name: "Server key" })]} initialLoadError={null} />)

    expect(screen.getByText("Server key")).toBeVisible()
    expect(screen.getByText("tw_abcd...wxyz")).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("shows a retryable inline state when API keys cannot load", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json(
          { error: { type: "storage_unavailable", message: "API key storage is unavailable." } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ object: "list", data: [apiKey()] }))

    render(<ApiKeysSettingsPanel />)

    expect(await screen.findByText("Could not load API keys. Try again.")).toBeVisible()
    expect(toastMocks.error).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Try again" }))

    expect(await screen.findByText("Production")).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("creates a key and shows the token once", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ object: "list", data: [] }))
      .mockResolvedValueOnce(Response.json({ ...apiKey(), token: "tw_secret_token" }, { status: 201 }))

    render(<ApiKeysSettingsPanel />)

    await screen.findByText("No active API keys yet.")
    await user.click(screen.getByRole("button", { name: "Create" }))
    await user.type(screen.getByLabelText("Name"), "Production")
    await user.click(screen.getByRole("button", { name: "Full access" }))
    await user.click(screen.getAllByRole("button", { name: "Create" }).at(-1)!)

    expect(await screen.findByDisplayValue("tw_secret_token")).toBeVisible()
    expect(screen.getByText("Production")).toBeVisible()
    expect(toastMocks.success).toHaveBeenCalledWith("API key created.")
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByDisplayValue("tw_secret_token")).not.toBeInTheDocument()
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/account/api-keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Production", permission: "full_access" }),
      }),
    )
  })

  it("clears the one-time token before another create flow starts", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ object: "list", data: [] }))
      .mockResolvedValueOnce(
        Response.json({ ...apiKey({ id: "key_1", name: "First" }), token: "tw_first_secret" }, { status: 201 }),
      )
      .mockResolvedValueOnce(Response.json({ object: "api_key", id: "key_1", deleted: true }))

    render(<ApiKeysSettingsPanel />)

    await screen.findByText("No active API keys yet.")
    await user.click(screen.getByRole("button", { name: "Create" }))
    await user.type(screen.getByLabelText("Name"), "First")
    await user.click(screen.getAllByRole("button", { name: "Create" }).at(-1)!)
    expect(await screen.findByDisplayValue("tw_first_secret")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Done" }))
    await user.click(screen.getByRole("button", { name: "Revoke" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Revoke this API key?")
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Revoke" }))
    await waitFor(() => expect(screen.getByText("No active API keys yet.")).toBeVisible())
    await user.click(screen.getByRole("button", { name: "Create" }))

    expect(screen.queryByDisplayValue("tw_first_secret")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("")
  })

  it("revokes an active key", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ object: "list", data: [apiKey()] }))
      .mockResolvedValueOnce(Response.json({ object: "api_key", id: "key_123", deleted: true }))

    render(<ApiKeysSettingsPanel />)

    await screen.findByText("Production")
    await user.click(screen.getByRole("button", { name: "Revoke" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent("This key will stop working")
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Revoke" }))

    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/api/account/api-keys/key_123", { method: "DELETE" }))
    expect(toastMocks.success).toHaveBeenCalledWith("API key revoked.")
    expect(screen.getByText("No active API keys yet.")).toBeVisible()
  })
})

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountMigrationSettings } from "@/components/account-migration-settings"

describe("AccountMigrationSettings", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("offers an account export download", () => {
    render(<AccountMigrationSettings />)

    expect(screen.getByRole("link", { name: /export account/i })).toHaveAttribute("href", "/api/account/export")
  })

  it("uploads an account export with safe conflict handling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accountPreferencesImported: true,
          created: ["project_123", "project_over_limit"],
          replaced: [],
          conflicts: [],
          notificationPreferencesImported: 2,
          profileImported: true,
          readOnlyProjectIds: ["project_over_limit"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    render(<AccountMigrationSettings />)

    const accountExport = { format: "tickward-account", version: 1, exportedAt: new Date().toISOString(), projects: [] }
    const file = new File([JSON.stringify(accountExport)], "account.json", { type: "application/json" })
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(accountExport) })
    fireEvent.change(screen.getByLabelText(/import account file/i), { target: { files: [file] } })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, request] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(request.body))).toEqual({ conflictStrategy: "skip", export: accountExport })
    expect(await screen.findByText(/created 2, replaced 0, conflicts 0, read-only 1/i)).toBeInTheDocument()
    expect(screen.getByText(/profile 1, account settings 1, notification rules 2/i)).toBeInTheDocument()
  })
})

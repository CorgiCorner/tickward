import { render, screen } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { describe, expect, it, vi } from "vitest"

import SubprocessorsPage, { generateMetadata } from "@/app/[locale]/legal/subprocessors/page"

vi.mock("@/components/marketing-page-shell", () => ({
  MarketingPageShell: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

vi.mock("@/lib/store", () => ({
  TimerStoreProvider: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

describe("subprocessors page", () => {
  it("renders the complete provider table and localized language notice", async () => {
    render(await SubprocessorsPage({ params: Promise.resolve({ locale: "de" }) }))

    expect(screen.getByRole("heading", { level: 1, name: "Subprocessors" })).toBeInTheDocument()
    expect(screen.getAllByRole("row")).toHaveLength(8)
    expect(screen.getByText("Dieses Dokument ist auf Englisch verfügbar.")).toBeInTheDocument()
  })

  it("uses the locale route for canonical metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "pl" }) })

    expect(metadata.alternates?.canonical).toBe("/pl/legal/subprocessors")
    expect(metadata.alternates?.languages).toMatchObject({
      en: "/en/legal/subprocessors",
      pl: "/pl/legal/subprocessors",
    })
  })
})

import { render, screen } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { describe, expect, it, vi } from "vitest"

import TermsPage, { generateMetadata } from "@/app/[locale]/legal/terms/page"

vi.mock("@/components/marketing-page-shell", () => ({
  MarketingPageShell: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

vi.mock("@/lib/store", () => ({
  TimerStoreProvider: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

describe("terms page", () => {
  it("renders the terms and localized language notice", async () => {
    render(await TermsPage({ params: Promise.resolve({ locale: "it" }) }))

    expect(screen.getByRole("heading", { level: 1, name: "Terms of service" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Governing law" })).toBeInTheDocument()
    expect(screen.getByText("Questo documento è disponibile in inglese.")).toBeInTheDocument()
  })

  it("uses the locale route for canonical metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "it" }) })

    expect(metadata.alternates?.canonical).toBe("/it/legal/terms")
    expect(metadata.alternates?.languages).toMatchObject({ en: "/en/legal/terms", it: "/it/legal/terms" })
  })
})

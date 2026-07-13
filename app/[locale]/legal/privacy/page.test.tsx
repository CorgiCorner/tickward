import { render, screen } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { describe, expect, it, vi } from "vitest"

import PrivacyPage, { generateMetadata } from "@/app/[locale]/legal/privacy/page"

vi.mock("@/components/marketing-page-shell", () => ({
  MarketingPageShell: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

vi.mock("@/lib/store", () => ({
  TimerStoreProvider: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

describe("privacy page", () => {
  it("renders the English policy and localized language notice", async () => {
    render(await PrivacyPage({ params: Promise.resolve({ locale: "pl" }) }))

    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Cookies" })).toBeInTheDocument()
    expect(screen.getByText("Ten dokument jest dostępny w języku angielskim.")).toBeInTheDocument()
  })

  it("uses the locale route for canonical metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "de" }) })

    expect(metadata.alternates?.canonical).toBe("/de/legal/privacy")
    expect(metadata.alternates?.languages).toMatchObject({ en: "/en/legal/privacy", de: "/de/legal/privacy" })
  })
})

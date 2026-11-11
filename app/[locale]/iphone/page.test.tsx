import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import IphonePage from "@/app/[locale]/iphone/page"

vi.mock("@/components/marketing-page-shell", () => ({
  MarketingPageShell: (props: { children: ReactNode }) => <main>{props.children}</main>,
}))

async function renderPage(locale: string) {
  render(await IphonePage({ params: Promise.resolve({ locale }) }))
}

describe("iPhone page", () => {
  it("shows the milestone section right after the Lock Screen section", async () => {
    await renderPage("en")

    const titles = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
    const lockIndex = titles.indexOf("The final hours, on your Lock Screen")
    expect(lockIndex).toBeGreaterThanOrEqual(0)
    expect(titles[lockIndex + 1]).toBe("Count up to the next milestone")

    const section = screen.getByRole("region", { name: "Count up to the next milestone" })
    const image = within(section).getByRole("img")
    expect(image.getAttribute("src")).toContain("05-since.jpg")
    expect(image).toHaveAttribute("alt", expect.stringContaining("1,300 days"))
  })

  it("lists nine features, including milestone days in reminders", async () => {
    await renderPage("en")

    const list = screen.getByRole("heading", { level: 2, name: "Everything you use on the web, made for iPhone" })
      .nextElementSibling as HTMLElement
    const titles = within(list)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent)
    expect(titles).toHaveLength(9)
    expect(titles.slice(-3)).toEqual(["Years, months and days", "Start over, keep the history", "Spaces, pins and search"])
    expect(within(list).getByText(/on every milestone day/)).toBeVisible()
  })

  it("renders the milestone section in Polish", async () => {
    await renderPage("pl")

    expect(screen.getByRole("region", { name: "Licz w górę do następnego kamienia milowego" })).toBeVisible()
  })
})

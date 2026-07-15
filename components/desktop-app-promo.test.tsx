import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DesktopAppPromo } from "@/components/desktop-app-promo"

vi.mock("@/lib/desktop-release", () => ({
  getLatestDesktopRelease: vi.fn().mockResolvedValue({
    version: "1.2.3",
    dmgUrl: "https://downloads.tickward.test/Tickward-Desktop-1.2.3.dmg",
  }),
}))

describe("DesktopAppPromo", () => {
  it("promotes the macOS release with compact metadata and a direct download action", async () => {
    const { container } = render(await DesktopAppPromo({ locale: "en" }))
    const download = screen.getByRole("link", { name: "Download for macOS" })

    expect(screen.getByRole("heading", { level: 2, name: "tickward for macOS" })).toBeInTheDocument()
    expect(screen.getByText(/lives in your menu bar/)).toBeInTheDocument()
    expect(screen.getByText("v1.2.3 · Apple silicon")).toBeInTheDocument()
    expect(screen.queryByText(/signed and notarized/i)).not.toBeInTheDocument()
    expect(download).toHaveAttribute("href", "https://downloads.tickward.test/Tickward-Desktop-1.2.3.dmg")
    expect(download).toHaveAttribute("download")
    expect(container.querySelector("section")).toHaveAttribute("aria-labelledby", "desktop-app-promo-title")
  })

  it("keeps the preview icon and countdown from shrinking around the timer label", async () => {
    const { container } = render(await DesktopAppPromo({ locale: "en" }))
    const timerIcon = container.querySelector(".lucide-timer")

    expect(timerIcon?.parentElement?.classList).toContain("shrink-0")
    expect(screen.getByText("Project deadline").classList).toContain("truncate")
    expect(screen.getByText("12d 04:32").classList).toContain("shrink-0")
  })
})

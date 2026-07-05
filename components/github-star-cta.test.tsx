import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

async function renderGitHubStarCta() {
  const { GitHubStarCta } = await import("@/components/github-star-cta")
  return render(<GitHubStarCta />)
}

function stubStars(stars: number) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ stargazers_count: stars }),
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("GitHubStarCta", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("renders the title, description, button link, and decorative pattern", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    const { container } = await renderGitHubStarCta()
    const button = screen.getByRole("link", { name: "Star Tickward on GitHub" })

    expect(screen.getByRole("heading", { level: 2, name: "Help Tickward reach 5,000 stars" })).toBeInTheDocument()
    expect(screen.getByText(/Tickward is free and open source/)).toBeInTheDocument()
    expect(button).toHaveAttribute("href", "https://github.com/CorgiCorner/tickward")
    expect(button).toHaveAttribute("target", "_blank")
    expect(button).toHaveAttribute("rel", "noreferrer")
    expect(container.querySelector('[data-slot="star-cta-pattern"]')).toBeInTheDocument()
  })

  it("shows fetched star progress", async () => {
    stubStars(1234)

    await renderGitHubStarCta()

    await waitFor(() => expect(screen.getByText("1,234 of 5,000 stars")).toBeInTheDocument())
    const progressbar = screen.getByRole("progressbar", { name: "1,234 of 5,000 stars" })

    expect(progressbar).toHaveAttribute("aria-valuenow", "1234")
    expect(progressbar.firstElementChild).toHaveStyle({ width: "24.68%" })
  })

  it("falls back to the goal when the star request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("GitHub unavailable"))
    vi.stubGlobal("fetch", fetchMock)

    await renderGitHubStarCta()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.getByText("Goal: 5,000 stars")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Goal: 5,000 stars" })).toHaveAttribute("aria-valuenow", "0")
  })

  it("keeps a small star count visible in the progress fill", async () => {
    stubStars(21)

    await renderGitHubStarCta()

    await waitFor(() => expect(screen.getByText("21 of 5,000 stars")).toBeInTheDocument())
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "1.5%" })
  })
})

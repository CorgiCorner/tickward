import { act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  COUNT_UP_HIGHLIGHT_DURATION_MS,
  countUpHomeHref,
  findCountUpCard,
  isCountUpCardInViewport,
  navigateToCountUpCard,
  storePendingCountUpTarget,
  takePendingCountUpTarget,
} from "@/components/count-up-navigation"

function addCard(projectId = "project-a", timerId = "timer-a", targetAtMs = 123) {
  const card = document.createElement("article")
  card.dataset.countUpProjectId = projectId
  card.dataset.countUpTimerId = timerId
  card.dataset.countUpTargetAtMs = String(targetAtMs)
  document.body.append(card)
  return card
}

describe("count-up navigation", () => {
  afterEach(() => {
    document.body.replaceChildren()
    sessionStorage.clear()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("keeps an exact target across navigation to the localized home route", () => {
    const target = { projectId: "project-b", timerId: "timer-b", targetAtMs: 456 }

    storePendingCountUpTarget(target)

    expect(countUpHomeHref("/pl/settings")).toBe("/pl")
    expect(takePendingCountUpTarget()).toEqual(target)
    expect(takePendingCountUpTarget()).toBeNull()
  })

  it("finds the exact project, timer, and occurrence", () => {
    addCard("project-a", "timer-a", 100)
    const expected = addCard("project-b", "timer-a", 200)

    expect(findCountUpCard({ projectId: "project-b", timerId: "timer-a", targetAtMs: 200 })).toBe(expected)
    expect(findCountUpCard({ projectId: "project-b", timerId: "timer-a", targetAtMs: 100 })).toBeNull()
  })

  it("reports whether any part of a card is in the viewport", () => {
    const card = addCard()
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      top: 100,
      right: 300,
      bottom: 200,
      left: 100,
      width: 200,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    })
    expect(isCountUpCardInViewport(card)).toBe(true)

    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      top: -200,
      right: 300,
      bottom: -100,
      left: 100,
      width: 200,
      height: 100,
      x: 100,
      y: -200,
      toJSON: () => ({}),
    })
    expect(isCountUpCardInViewport(card)).toBe(false)
  })

  it("opens the project, retries for the rendered card, scrolls, and highlights without focusing", async () => {
    vi.useFakeTimers()
    const openProject = vi.fn()
    const scrollIntoView = vi.fn()
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    const navigation = navigateToCountUpCard(
      { projectId: "project-b", timerId: "timer-b", targetAtMs: 456 },
      { openProject, retryMs: 10, retryLimit: 2 },
    )

    await Promise.resolve()
    const card = addCard("project-b", "timer-b", 456)
    card.scrollIntoView = scrollIntoView
    await act(async () => vi.advanceTimersByTimeAsync(10))

    await expect(navigation).resolves.toBe(true)
    expect(openProject).toHaveBeenCalledWith("project-b")
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" })
    expect(card).toHaveAttribute("data-count-up-highlighted", "true")
    expect(focus).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(COUNT_UP_HIGHLIGHT_DURATION_MS))
    expect(card).not.toHaveAttribute("data-count-up-highlighted")
  })

  it("uses non-animated scrolling when reduced motion is preferred", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    )
    const card = addCard()
    card.scrollIntoView = vi.fn()

    await navigateToCountUpCard(
      { projectId: "project-a", timerId: "timer-a", targetAtMs: 123 },
      { openProject: vi.fn() },
    )

    expect(card.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" })
  })
})

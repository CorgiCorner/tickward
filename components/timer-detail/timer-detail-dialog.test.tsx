import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { countUpFormatStorageKey } from "@/components/dashboard/count-up-format"
import { TimerDetailDialog } from "@/components/timer-detail/timer-detail-dialog"
import { TimerDetailOpener } from "@/components/timer-detail/timer-detail-opener"
import type { Space, Timer } from "@/lib/types"

// The edit form has its own suite; here it only needs to hand the place back.
vi.mock("@/components/timer-form", () => ({
  TimerForm: (props: {
    surface?: string
    initial?: Timer
    onOpenChange: (open: boolean) => void
    onSubmit: (value: { label: string }) => void
  }) => (
    <div data-testid="edit-form" data-surface={props.surface}>
      <p>Edit timer</p>
      <button
        type="button"
        onClick={() => {
          props.onSubmit({ label: `${props.initial?.label} (edited)` })
          props.onOpenChange(false)
        }}
      >
        Save
      </button>
    </div>
  ),
}))

const space: Space = { id: "space-home", name: "Coming up", color: "#2563eb", createdAt: "2026-11-01T00:00:00.000Z" }

const countUp: Timer = {
  id: "timer-since",
  label: "Since we met",
  description: "The evening at the lake.",
  targetDate: "2023-04-20T16:00:00.000Z",
  timezone: "UTC",
  createdAt: "2026-11-10T09:00:00.000Z",
  sharedAt: "2026-11-10T09:00:00.000Z",
  spaceId: "space-home",
  color: "#7759e6",
  mode: "since",
  milestones: {
    rules: [
      { unit: "days", every: 100 },
      { unit: "years", every: 1 },
    ],
  },
}

const countdown: Timer = {
  id: "timer-until",
  label: "Marta's birthday",
  description: "Order the cake by Tuesday.",
  targetDate: "2026-11-16T17:00:00.000Z",
  timezone: "Europe/Warsaw",
  createdAt: "2026-11-10T09:00:00.000Z",
  reminders: [{ offsetMinutes: 60 }, { offsetMinutes: 1440 }],
}

const milestoneDay = Date.parse("2026-11-10T16:12:44.000Z")

afterEach(() => {
  globalThis.localStorage.clear()
})

function renderDialog(props: Partial<Parameters<typeof TimerDetailDialog>[0]> = {}) {
  const onOpenChange = vi.fn()
  render(
    <TimerDetailDialog
      open
      onOpenChange={onOpenChange}
      timer={countUp}
      space={space}
      signedIn
      nowMs={milestoneDay}
      onEdit={vi.fn()}
      onShare={vi.fn()}
      {...props}
    />,
  )
  return { onOpenChange, dialog: screen.getByRole("dialog", { name: (props.timer ?? countUp).label }) }
}

describe("TimerDetailDialog", () => {
  it("shows a count-up's heading, milestone day and milestone list", () => {
    const { dialog } = renderDialog()

    expect(within(dialog).getByText("Since Thu, Apr 20, 2023 · UTC")).toBeInTheDocument()
    expect(within(dialog).getByText("The evening at the lake.")).toBeInTheDocument()
    expect(within(dialog).getByTestId("timer-detail-milestone-badge")).toHaveTextContent("Milestone reached")
    expect(within(dialog).getAllByText("1,200 days")).toHaveLength(2)
    expect(within(dialog).getByText("1,300 days · reached today")).toBeInTheDocument()
    expect(within(dialog).getByTestId("timer-detail-progress-fill")).toHaveStyle({ width: "100%" })

    const upcoming = within(dialog).getAllByTestId("timer-detail-milestone-upcoming")
    expect(upcoming.map((row) => row.textContent)).toEqual([
      "4 yearsTue, Apr 20, 2027 · in 161 days",
      "1,400 daysThu, Feb 18, 2027 · in 100 days",
    ])
    const today = within(dialog).getByTestId("timer-detail-milestone-today")
    expect(today).toHaveTextContent("1,300 daysToday")
    // Today is marked by weight, not by the timer colour.
    expect(today.firstElementChild).toHaveClass("font-medium")
    expect(today.querySelector("[style]")).toBeNull()
  })

  it("shows three reached milestones and reveals the earlier ones on request", async () => {
    const user = userEvent.setup()
    const { dialog } = renderDialog()

    expect(within(dialog).getAllByTestId("timer-detail-milestone-reached")).toHaveLength(3)
    await user.click(within(dialog).getByRole("button", { name: /Show 12 earlier/ }))
    expect(within(dialog).getAllByTestId("timer-detail-milestone-reached")).toHaveLength(15)
    expect(within(dialog).queryByRole("button", { name: /earlier/ })).not.toBeInTheDocument()
  })

  it("tightens the thousands separator of the day count", () => {
    const { dialog } = renderDialog()
    const days = within(dialog).getByTestId("timer-detail-days")
    expect(days.querySelector("[data-group-separator]")).toHaveTextContent(",")
    expect(days).toHaveTextContent("1,300")
  })

  it("switches the count format and keeps it on this device", async () => {
    const user = userEvent.setup()
    const { dialog } = renderDialog()
    const group = within(dialog).getByRole("group", { name: "Count format" })

    expect(within(group).getByRole("button", { name: "Total days" })).toHaveAttribute("aria-pressed", "true")
    // The number is also a switch; its label starts with the count so it is still heard.
    expect(within(dialog).getByRole("button", { name: "1,300 days. Show years, months and days" })).toBeInTheDocument()
    await user.click(within(group).getByRole("button", { name: "Years, months, days" }))

    expect(globalThis.localStorage.getItem(countUpFormatStorageKey(countUp.id))).toBe("calendar")
    expect(within(group).getByRole("button", { name: "Years, months, days" })).toHaveAttribute("aria-pressed", "true")
    const calendar = within(dialog).getByTestId("timer-detail-calendar")
    expect(calendar).toHaveTextContent("3years6 months, 21 days00:12:44")
    expect(calendar.parentElement).not.toHaveAttribute("aria-hidden", "true")

    await user.click(within(dialog).getByRole("button", { name: "3 years, 6 months, 21 days. Show total days" }))
    expect(globalThis.localStorage.getItem(countUpFormatStorageKey(countUp.id))).toBeNull()
  })

  it("has no format switch before a full month has passed", () => {
    const { dialog } = renderDialog({ timer: { ...countUp, targetDate: "2026-10-20T16:00:00.000Z" } })
    expect(within(dialog).queryByRole("group", { name: "Count format" })).not.toBeInTheDocument()
    expect(within(dialog).getByTestId("timer-detail-days")).toHaveTextContent("21")
  })

  it("lists a countdown's reminders with their dates and delivery", () => {
    const { dialog } = renderDialog({ timer: countdown, nowMs: Date.parse("2026-11-10T10:49:57.000Z") })

    expect(within(dialog).getByText("Mon, Nov 16 · 18:00 · Europe/Warsaw")).toBeInTheDocument()
    expect(
      within(dialog)
        .getAllByTestId("timer-detail-reminder")
        .map((row) => row.textContent),
    ).toEqual(["1 day beforeSun, Nov 15 · 18:00", "1 hour beforeMon, Nov 16 · 17:00"])
    expect(within(dialog).getByText("Sent in the app and by email.")).toBeInTheDocument()
    expect(within(dialog).getAllByTestId("timer-detail-progress-marker")).toHaveLength(2)
    expect(within(dialog).queryByRole("group", { name: "Count format" })).not.toBeInTheDocument()
  })

  it("tells signed-out people that reminders need an account", () => {
    const { dialog } = renderDialog({
      timer: countdown,
      signedIn: false,
      nowMs: Date.parse("2026-11-10T10:00:00.000Z"),
    })
    expect(within(dialog).getByText(/Sign in to turn them on/)).toBeInTheDocument()
  })

  it("shows sharing, space and creation date without opening the form", async () => {
    const user = userEvent.setup()
    const onCopyShareLink = vi.fn()
    const { dialog } = renderDialog({ onCopyShareLink })

    expect(within(dialog).getByText("Public link is on")).toBeInTheDocument()
    expect(within(dialog).getByText("Coming up")).toBeInTheDocument()
    expect(within(dialog).getByText("Nov 10, 2026")).toBeInTheDocument()
    expect(within(dialog).getByText("At each milestone, in the app and by email")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Copy link" }))
    expect(onCopyShareLink).toHaveBeenCalledOnce()
  })

  it("closes from the back control and hides Edit for timers that cannot be edited", async () => {
    const user = userEvent.setup()
    const { dialog, onOpenChange } = renderDialog({ onEdit: undefined })

    expect(within(dialog).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Edit rules" })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Timers" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe("TimerDetailDialog motion", () => {
  it("scales from 0.97 in 220 ms, closes in 160 ms and only fades with reduced motion", () => {
    const { dialog } = renderDialog()
    expect(dialog).toHaveClass(
      "data-[state=open]:zoom-in-[0.97]",
      "data-[state=open]:duration-enter",
      "data-[state=open]:ease-move",
      "data-[state=closed]:duration-exit",
      "motion-reduce:data-[state=open]:zoom-in-100",
      "motion-reduce:data-[state=closed]:zoom-out-100",
    )
  })

  it("cross-fades the count formats without moving them", async () => {
    const user = userEvent.setup()
    const { dialog } = renderDialog()
    await user.click(within(dialog).getByRole("button", { name: "Years, months, days" }))

    const shown = within(dialog).getByTestId("timer-detail-calendar").parentElement
    const hidden = within(dialog).getByTestId("timer-detail-days").parentElement
    expect(shown).toHaveClass("opacity-100", "duration-enter", "transition-[opacity,visibility]")
    expect(hidden).toHaveClass("opacity-0", "invisible", "duration-exit")
    expect(hidden).toHaveAttribute("aria-hidden", "true")
  })
})

describe("TimerDetailDialog edit", () => {
  it("replaces the detail content with the form in the same dialog and returns on Escape", async () => {
    const user = userEvent.setup()
    const onEditSubmit = vi.fn()
    renderDialog({ onEdit: undefined, onEditSubmit })

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0])
    const form = await screen.findByTestId("edit-form")
    expect(form).toHaveAttribute("data-surface", "inline")
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(screen.getByRole("dialog")).toContainElement(form)
    expect(screen.queryByText("The evening at the lake.")).not.toBeInTheDocument()
    expect(screen.getByTestId("timer-detail-edit-back")).toHaveFocus()

    await user.keyboard("{Escape}")
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: "Since we met" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Edit" })[0]).toHaveFocus()
  })

  it("swaps the content with a fade only and keeps the panel size still with reduced motion", async () => {
    const keyframes: Keyframe[][] = []
    Element.prototype.animate = vi.fn(function (frames: Keyframe[]) {
      keyframes.push(frames)
      const animation = { onfinish: null as null | (() => void), cancel: vi.fn() }
      // Finish at once, so the swap goes on.
      queueMicrotask(() => animation.onfinish?.())
      return animation as unknown as Animation
    }) as unknown as typeof Element.prototype.animate
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    try {
      const user = userEvent.setup()
      renderDialog({ onEdit: undefined, onEditSubmit: vi.fn() })
      await user.click(screen.getAllByRole("button", { name: "Edit" })[0])
      await screen.findByTestId("edit-form")

      expect(keyframes.length).toBeGreaterThan(0)
      for (const frames of keyframes) {
        for (const frame of frames) {
          // No height animation and no travel: opacity only.
          expect(frame.height).toBeUndefined()
          expect([undefined, "none", "translateY(0px)"]).toContain(frame.transform)
        }
      }
    } finally {
      // @ts-expect-error jsdom has no Web Animations; the stub is removed again.
      delete Element.prototype.animate
      vi.unstubAllGlobals()
    }
  })

  it("saves through the host and comes back to the detail view", async () => {
    const user = userEvent.setup()
    const onEditSubmit = vi.fn()
    renderDialog({ onEdit: undefined, onEditSubmit })

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0])
    await user.click(await screen.findByRole("button", { name: "Save" }))

    expect(onEditSubmit).toHaveBeenCalledWith({ label: "Since we met (edited)" })
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: "Since we met" })).toBeInTheDocument()
  })
})

describe("TimerDetailOpener", () => {
  function renderOpener(props: { onFocus?: (returnFocusTo?: HTMLElement | null) => void } = {}) {
    render(
      <article className="relative">
        <TimerDetailOpener timer={countUp} space={space} signedIn nowMs={milestoneDay} onFocus={props.onFocus} />
      </article>,
    )
    return screen.getByRole("button", { name: "Open Since we met" })
  }

  it("opens the detail view as a dialog and returns focus to the card on Escape", async () => {
    const user = userEvent.setup()
    const opener = renderOpener()

    expect(opener).toHaveAttribute("aria-haspopup", "dialog")
    await user.click(opener)
    const dialog = await screen.findByRole("dialog", { name: "Since we met" })
    expect(opener).toHaveAttribute("aria-expanded", "true")
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    // The dialog primitive returns focus on a timer after it unmounts, so the body holds focus
    // for a moment after the dialog is gone. Wait for the return instead of racing it.
    await waitFor(() => expect(opener).toHaveFocus())
    expect(opener).toHaveAttribute("aria-expanded", "false")
  })

  it("moves focus into the view without a ring for a click and onto Back for the keyboard", async () => {
    const user = userEvent.setup()
    const opener = renderOpener()

    await user.click(opener)
    const dialog = await screen.findByRole("dialog", { name: "Since we met" })
    expect(dialog).toHaveFocus()

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await user.keyboard("{Enter}")
    const reopened = await screen.findByRole("dialog", { name: "Since we met" })
    expect(within(reopened).getByRole("button", { name: "Timers" })).toHaveFocus()
  })

  it("keeps Tab inside the open view", async () => {
    const user = userEvent.setup()
    const opener = renderOpener()

    await user.click(opener)
    const dialog = await screen.findByRole("dialog", { name: "Since we met" })
    for (let step = 0; step < 12; step++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it("hands over to focus mode in one step and lets it return focus to the card", async () => {
    const user = userEvent.setup()
    const onFocus = vi.fn()
    const opener = renderOpener({ onFocus })

    await user.click(opener)
    const dialog = await screen.findByRole("dialog", { name: "Since we met" })
    await user.click(within(dialog).getByRole("button", { name: "Focus" }))

    // Focus mode opens at once, while the detail view is still on screen under it.
    expect(onFocus).toHaveBeenCalledOnce()
    expect(onFocus).toHaveBeenCalledWith(opener)
    expect(dialog).toHaveAttribute("data-handoff", "true")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    // Focus mode owns focus now; the closing view does not pull it back to the card.
    expect(opener).not.toHaveFocus()
  })
})

import { render, screen } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FLIP_DURATION_MS, FLIP_EASING, useFlipReorder } from "@/components/dashboard/use-flip-reorder"

const ROW = 100

function List(props: Readonly<{ ids: string[]; skip?: boolean; draft?: string }>) {
  const root = useRef<HTMLDivElement>(null)
  const skipNext = useFlipReorder(root, props.ids.join(","))
  if (props.skip) skipNext()
  return (
    <>
      <input aria-label="Quick add" value={props.draft ?? ""} readOnly />
      <div ref={root}>
        {props.ids.map((id, index) => (
          <div key={id} data-flip-key={id} data-index={index} />
        ))}
      </div>
    </>
  )
}

function setReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches }))
}

describe("useFlipReorder", () => {
  const animate = vi.fn()

  beforeEach(() => {
    animate.mockReset()
    setReducedMotion(false)
    Element.prototype.animate = animate as unknown as Element["animate"]
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const index = Number((this as HTMLElement).dataset.index ?? 0)
      return { left: 0, top: index * ROW, width: 10, height: 10 } as DOMRect
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("glides moved cards from their old place", () => {
    const { rerender } = render(<List ids={["a", "b", "c"]} />)
    expect(animate).not.toHaveBeenCalled()

    rerender(<List ids={["c", "a", "b"]} />)

    expect(animate).toHaveBeenCalledTimes(3)
    expect(animate).toHaveBeenCalledWith(
      [{ transform: `translate(0px, ${2 * ROW}px)` }, { transform: "translate(0, 0)" }],
      { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
    )
  })

  it("measures again on the press that starts a change, so earlier size changes do not count", () => {
    const offsets = new Map<string, number>()
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const el = this as HTMLElement
      const index = Number(el.dataset.index ?? 0)
      return {
        left: 0,
        top: index * ROW + (offsets.get(el.dataset.flipKey ?? "") ?? 0),
        width: 10,
        height: 10,
      } as DOMRect
    })
    const { rerender } = render(<List ids={["a", "b", "c"]} />)
    // "c" shifted after the last render (a card above grew); then the user acts.
    offsets.set("c", 40)
    document.dispatchEvent(new Event("pointerdown"))

    rerender(<List ids={["b", "a", "c"]} />)

    expect(animate).toHaveBeenCalledTimes(2)
  })

  it("measures again on Enter in a field, the press that submits Quick Add and inserts a card", () => {
    const offsets = new Map<string, number>()
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const el = this as HTMLElement
      const index = Number(el.dataset.index ?? 0)
      return {
        left: 0,
        top: index * ROW + (offsets.get(el.dataset.flipKey ?? "") ?? 0),
        width: 10,
        height: 10,
      } as DOMRect
    })
    const { rerender } = render(<List ids={["a", "b", "c"]} draft="Mo" />)
    // "c" shifted while the user typed (a card above grew); then Enter submits.
    offsets.set("c", 40)
    const field = screen.getByRole("textbox", { name: "Quick add" })
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    rerender(<List ids={["n", "a", "b", "c"]} />)

    const moveOfC = (dy: number) => [{ transform: `translate(0px, ${dy}px)` }, { transform: "translate(0, 0)" }]
    expect(animate).toHaveBeenCalledWith(moveOfC(-ROW), { duration: FLIP_DURATION_MS, easing: FLIP_EASING })
    expect(animate).not.toHaveBeenCalledWith(moveOfC(-ROW - 40), expect.anything())
  })

  it("does not move anything when the order is unchanged", () => {
    const { rerender } = render(<List ids={["a", "b"]} />)
    rerender(<List ids={["a", "b"]} />)
    expect(animate).not.toHaveBeenCalled()
  })

  it("keeps cards still under reduced motion", () => {
    setReducedMotion(true)
    const { rerender } = render(<List ids={["a", "b"]} />)
    rerender(<List ids={["b", "a"]} />)
    expect(animate).not.toHaveBeenCalled()
  })

  it("skips a change that is already on screen, such as a finished drag", () => {
    const { rerender } = render(<List ids={["a", "b"]} />)
    rerender(<List ids={["b", "a"]} skip />)
    expect(animate).not.toHaveBeenCalled()
  })

  it("drops a skip whose change left the order as it was, so the next reorder still glides", () => {
    const { rerender } = render(<List ids={["a", "b"]} />)
    // skipNext ran, but the update kept the same order (a no-op move).
    rerender(<List ids={["a", "b"]} skip />)

    rerender(<List ids={["b", "a"]} />)

    expect(animate).toHaveBeenCalledTimes(2)
  })

  it("measures only when the order changes, not on every render or keystroke in a field", () => {
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect")
    const { rerender } = render(<List ids={["a", "b", "c"]} />)
    expect(rect).toHaveBeenCalledTimes(3)
    rect.mockClear()

    // Typing re-renders the page and fires key events inside the field.
    const field = screen.getByRole("textbox", { name: "Quick add" })
    for (const draft of ["M", "Mo", "Mov"]) {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: draft.at(-1), bubbles: true }))
      rerender(<List ids={["a", "b", "c"]} draft={draft} />)
    }
    expect(rect).not.toHaveBeenCalled()

    // A key press outside a field may start a change, so it measures.
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(rect).toHaveBeenCalledTimes(3)
  })
})

import { act, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MOTION_MS } from "@/components/dashboard/motion"
import { useViewCrossfade, VIEW_CROSSFADE_TRAVEL_PX } from "@/components/dashboard/use-view-crossfade"

type Call = { keyframes: Keyframe[]; options: KeyframeAnimationOptions; animation: FakeAnimation }
type FakeAnimation = { onfinish: (() => void) | null; cancel: () => void; finish: () => void }

let calls: Call[] = []

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

function Switcher(props: Readonly<{ view: string }>) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useViewCrossfade(props.view, ref)
  return (
    <div ref={ref} data-testid="content">
      {shown}
    </div>
  )
}

beforeEach(() => {
  calls = []
  Element.prototype.animate = vi.fn(function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const animation: FakeAnimation = {
      onfinish: null,
      cancel: vi.fn(),
      finish: () => animation.onfinish?.(),
    }
    calls.push({ keyframes, options, animation })
    return animation as unknown as Animation
  }) as unknown as typeof Element.prototype.animate
})

afterEach(() => {
  // @ts-expect-error jsdom has no Web Animations; the stub is removed again.
  delete Element.prototype.animate
  vi.unstubAllGlobals()
})

describe("useViewCrossfade", () => {
  it("fades the old layout out in 160 ms, then the new one in over 220 ms rising a few pixels", () => {
    mockReducedMotion(false)
    const { rerender } = render(<Switcher view="grid" />)
    rerender(<Switcher view="list" />)

    // The old layout stays until it has faded out; focus and layout are not touched.
    expect(screen.getByTestId("content")).toHaveTextContent("grid")
    expect(calls[0].options.duration).toBe(MOTION_MS.exit)
    expect(calls[0].keyframes.at(-1)).toMatchObject({ opacity: 0 })

    act(() => calls[0].animation.finish())
    expect(screen.getByTestId("content")).toHaveTextContent("list")
    expect(calls[1].options.duration).toBe(MOTION_MS.enter)
    expect(calls[1].keyframes[0]).toMatchObject({ opacity: 0, transform: `translateY(${VIEW_CROSSFADE_TRAVEL_PX}px)` })
  })

  it("keeps only the fade with reduced motion", () => {
    mockReducedMotion(true)
    const { rerender } = render(<Switcher view="grid" />)
    rerender(<Switcher view="dial" />)
    act(() => calls[0].animation.finish())

    expect(screen.getByTestId("content")).toHaveTextContent("dial")
    for (const call of calls) {
      for (const frame of call.keyframes) {
        expect(frame.transform === undefined || frame.transform === "translateY(0px)" || frame.transform === "none").toBe(
          true,
        )
      }
    }
  })

  it("is interruptible: going back before the swap fades the current layout back in", () => {
    mockReducedMotion(false)
    const { rerender } = render(<Switcher view="grid" />)
    rerender(<Switcher view="list" />)
    rerender(<Switcher view="grid" />)

    expect(calls[0].animation.cancel).toHaveBeenCalled()
    expect(calls[1].keyframes.at(-1)).toMatchObject({ opacity: 1 })
    act(() => calls[0].animation.finish())
    expect(screen.getByTestId("content")).toHaveTextContent("grid")
  })
})

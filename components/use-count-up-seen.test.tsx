import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  COUNT_UP_SEEN_DWELL_MS,
  createCountUpDwellTracker,
  useCountUpSeenCard,
  useBatchedCountUpSeen,
} from "@/components/use-count-up-seen"

describe("createCountUpDwellTracker", () => {
  beforeEach(() => vi.useFakeTimers())

  afterEach(() => vi.useRealTimers())

  it("requires a visible, focused app and at least fifty percent intersection for the full dwell", () => {
    const onDwell = vi.fn()
    const tracker = createCountUpDwellTracker(onDwell)

    tracker.update({ documentVisible: true, windowFocused: true, intersectionRatio: 0.49 })
    vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS)
    expect(onDwell).not.toHaveBeenCalled()

    tracker.update({ intersectionRatio: 0.5 })
    vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS - 1)
    expect(onDwell).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDwell).toHaveBeenCalledTimes(1)

    tracker.update({ intersectionRatio: 1 })
    vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS)
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  it("cancels dwell on early viewport exit, tab hiding, or window blur", () => {
    const onDwell = vi.fn()
    const tracker = createCountUpDwellTracker(onDwell, {
      initialState: { documentVisible: true, windowFocused: true },
    })

    tracker.update({ intersectionRatio: 0.5 })
    vi.advanceTimersByTime(800)
    tracker.update({ intersectionRatio: 0.49 })
    vi.advanceTimersByTime(800)
    tracker.update({ intersectionRatio: 0.5 })
    vi.advanceTimersByTime(800)
    tracker.update({ documentVisible: false })
    vi.advanceTimersByTime(800)
    tracker.update({ documentVisible: true })
    vi.advanceTimersByTime(800)
    tracker.update({ windowFocused: false })
    vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS)

    expect(onDwell).not.toHaveBeenCalled()

    tracker.update({ windowFocused: true })
    vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS)
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  it("accepts keyboard focus as the card visibility signal but still requires an active app and dwell", () => {
    const onDwell = vi.fn()
    const tracker = createCountUpDwellTracker(onDwell)

    tracker.update({ focusWithin: true })
    vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS)
    expect(onDwell).not.toHaveBeenCalled()

    tracker.update({ documentVisible: true, windowFocused: true })
    vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS)
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  it("cancels pending work when disposed", () => {
    const onDwell = vi.fn()
    const tracker = createCountUpDwellTracker(onDwell, {
      initialState: { documentVisible: true, windowFocused: true, intersectionRatio: 1 },
    })
    tracker.update({})
    tracker.dispose()
    vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS)
    expect(onDwell).not.toHaveBeenCalled()
  })
})

type ObserverRecord = {
  callback: IntersectionObserverCallback
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

function SeenCard(props: Readonly<{ eventKey: string | null; onSeen: (key: string) => void }>) {
  const ref = useCountUpSeenCard(props.eventKey, props.onSeen)
  return (
    <article ref={ref}>
      <button type="button">Card action</button>
    </article>
  )
}

function SeenBatch(props: Readonly<{ onSeen: (keys: string[]) => void }>) {
  const queue = useBatchedCountUpSeen(props.onSeen)
  const [count, setCount] = useState(0)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          queue("first")
          queue("first")
          queue("second")
          setCount((value) => value + 1)
        }}
      >
        Queue
      </button>
      <span>{count}</span>
    </>
  )
}

describe("attention seen hooks", () => {
  let observers: ObserverRecord[]

  beforeEach(() => {
    vi.useFakeTimers()
    observers = []
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    vi.spyOn(document, "hasFocus").mockReturnValue(true)

    class FakeIntersectionObserver {
      readonly root = null
      readonly rootMargin = "0px"
      readonly thresholds = [0, 0.5]
      readonly observe = vi.fn()
      readonly disconnect = vi.fn()
      readonly takeRecords = vi.fn(() => [])
      readonly unobserve = vi.fn()

      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, observe: this.observe, disconnect: this.disconnect })
      }
    }

    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function intersect(target: Element, ratio: number) {
    const entry = {
      target,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
    } as IntersectionObserverEntry
    act(() => observers[0].callback([entry], {} as IntersectionObserver))
  }

  it("marks a mounted card after a qualifying intersection and cleans up on removal", () => {
    const onSeen = vi.fn()
    const view = render(<SeenCard eventKey="timer|100" onSeen={onSeen} />)
    const card = screen.getByRole("article")

    expect(observers[0].observe).toHaveBeenCalledWith(card)
    intersect(card, 0.5)
    act(() => vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS))
    expect(onSeen).toHaveBeenCalledWith("timer|100")

    view.unmount()
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it("cancels a pending dwell when the occurrence is hidden, collapsed, or already seen", () => {
    const onSeen = vi.fn()
    const view = render(<SeenCard eventKey="timer|150" onSeen={onSeen} />)
    const card = screen.getByRole("article")
    intersect(card, 0.5)
    act(() => vi.advanceTimersByTime(800))

    view.rerender(<SeenCard eventKey={null} onSeen={onSeen} />)
    act(() => vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS))

    expect(onSeen).not.toHaveBeenCalled()
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    expect(observers).toHaveLength(1)
  })

  it("does not carry dwell across a window blur and supports focus within the card", () => {
    const onSeen = vi.fn()
    render(<SeenCard eventKey="timer|200" onSeen={onSeen} />)
    const card = screen.getByRole("article")

    intersect(card, 0.5)
    act(() => vi.advanceTimersByTime(800))
    act(() => globalThis.dispatchEvent(new Event("blur")))
    act(() => vi.advanceTimersByTime(800))
    expect(onSeen).not.toHaveBeenCalled()

    act(() => globalThis.dispatchEvent(new Event("focus")))
    intersect(card, 0.1)
    fireEvent.focus(screen.getByRole("button", { name: "Card action" }))
    act(() => vi.advanceTimersByTime(COUNT_UP_SEEN_DWELL_MS))
    expect(onSeen).toHaveBeenCalledWith("timer|200")
  })

  it("batches and deduplicates seen keys for about half a second", () => {
    const onSeen = vi.fn()
    render(<SeenBatch onSeen={onSeen} />)
    fireEvent.click(screen.getByRole("button", { name: "Queue" }))

    act(() => vi.advanceTimersByTime(499))
    expect(onSeen).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onSeen).toHaveBeenCalledWith(["first", "second"])
  })
})

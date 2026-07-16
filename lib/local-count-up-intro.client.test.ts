import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  LOCAL_COUNT_UP_INTRO_DISMISSED_KEY,
  setLocalCountUpIntroDismissed,
  useLocalCountUpIntroDismissed,
} from "@/lib/local-count-up-intro.client"

describe("local attention intro dismissal", () => {
  it("persists dismissal and notifies mounted consumers", () => {
    const { result } = renderHook(() => useLocalCountUpIntroDismissed())
    expect(result.current).toBe(false)

    act(() => setLocalCountUpIntroDismissed(true))

    expect(result.current).toBe(true)
    expect(localStorage.getItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY)).toBe("1")
  })

  it("restores the first-use state when cleared", () => {
    localStorage.setItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY, "1")
    const { result } = renderHook(() => useLocalCountUpIntroDismissed())
    expect(result.current).toBe(true)

    act(() => setLocalCountUpIntroDismissed(false))

    expect(result.current).toBe(false)
    expect(localStorage.getItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY)).toBeNull()
  })
})

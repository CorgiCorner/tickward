import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  __resetClientErrorReporting,
  isChunkLoadError,
  registerClientErrorReporter,
  reportClientError,
  shouldRecoverFromChunkError,
  toClientErrorReport,
} from "@/lib/error-reporting"

describe("isChunkLoadError", () => {
  it("detects chunk failures by name and message, ignores the rest", () => {
    expect(isChunkLoadError(Object.assign(new Error("x"), { name: "ChunkLoadError" }))).toBe(true)
    expect(isChunkLoadError(new Error("Loading chunk 42 failed"))).toBe(true)
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /a.js"))).toBe(true)
    expect(isChunkLoadError(new Error("a regular runtime error"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe("shouldRecoverFromChunkError", () => {
  beforeEach(() => sessionStorage.clear())

  it("allows one recovery then refuses to loop", () => {
    const error = Object.assign(new Error("x"), { name: "ChunkLoadError" })
    expect(shouldRecoverFromChunkError(error)).toBe(true)
    expect(shouldRecoverFromChunkError(error)).toBe(false)
  })

  it("never recovers from non-chunk errors", () => {
    expect(shouldRecoverFromChunkError(new Error("nope"))).toBe(false)
  })
})

describe("reportClientError", () => {
  beforeEach(() => {
    __resetClientErrorReporting()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    __resetClientErrorReporting()
    vi.restoreAllMocks()
  })

  it("forwards to the registered reporter and the endpoint, deduping repeats", () => {
    const sink = vi.fn()
    const beacon = vi.fn()
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon })
    registerClientErrorReporter(sink)

    const report = toClientErrorReport({ kind: "react", error: new Error("kaboom"), digest: "d1" })
    reportClientError(report)
    reportClientError(report)

    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ kind: "react", message: "kaboom", digest: "d1" }))
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it("survives a throwing custom reporter", () => {
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: vi.fn() })
    registerClientErrorReporter(() => {
      throw new Error("reporter is broken")
    })
    expect(() => reportClientError(toClientErrorReport({ kind: "window", error: "boom" }))).not.toThrow()
  })
})

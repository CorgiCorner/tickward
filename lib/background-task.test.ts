import { afterEach, describe, expect, it, vi } from "vitest"

import { runInBackground } from "@/lib/background-task"

describe("runInBackground", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("logs a rejected task under its context tag instead of leaving it unhandled", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const error = new Error("background task failed")

    runInBackground("test.failingTask", Promise.reject(error))

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("[tickward] test.failingTask", error)
    })
  })

  it("does not log when the task resolves", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    runInBackground("test.successfulTask", Promise.resolve("done"))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(consoleError).not.toHaveBeenCalled()
  })

  it("does not block the caller while the task is pending", () => {
    let settled = false
    const task = new Promise<void>((resolve) => {
      setTimeout(() => {
        settled = true
        resolve()
      }, 0)
    })

    runInBackground("test.pendingTask", task)

    expect(settled).toBe(false)
  })

  it("accepts a missing task from optional callbacks", () => {
    expect(() => runInBackground("test.missingTask", undefined)).not.toThrow()
    expect(() => runInBackground("test.missingTask", null)).not.toThrow()
  })
})

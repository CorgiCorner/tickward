import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import RouteError from "@/app/[locale]/error"

const mocks = vi.hoisted(() => ({
  report: vi.fn(),
  shouldRecover: vi.fn<(error: unknown) => boolean>(() => false),
  reload: vi.fn(),
}))

vi.mock("@/lib/error-reporting", () => ({
  reportClientError: mocks.report,
  toClientErrorReport: (args: unknown) => args,
  shouldRecoverFromChunkError: mocks.shouldRecover,
  reloadPage: mocks.reload,
}))

describe("RouteError", () => {
  afterEach(() => {
    vi.clearAllMocks()
    mocks.shouldRecover.mockReturnValue(false)
  })

  it("renders the fallback and reports the error", () => {
    render(<RouteError error={Object.assign(new Error("boom"), { digest: "d" })} reset={vi.fn()} />)

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText("This page couldn't load. Reload to try again, or go back.")).toBeInTheDocument()
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ kind: "react", digest: "d" }))
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it("reloads instead of reporting on a chunk error", () => {
    mocks.shouldRecover.mockReturnValueOnce(true)

    render(<RouteError error={new Error("Loading chunk failed")} reset={vi.fn()} />)

    expect(mocks.reload).toHaveBeenCalledTimes(1)
    expect(mocks.report).not.toHaveBeenCalled()
  })

  it("retries through reset", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    render(<RouteError error={new Error("x")} reset={reset} />)

    await user.click(screen.getByRole("button", { name: "Reload" }))

    expect(reset).toHaveBeenCalledTimes(1)
  })
})

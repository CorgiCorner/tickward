import { act } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { IosPwaPrompt } from "@/components/ios-pwa-prompt"

describe("IosPwaPrompt", () => {
  it("hydrates without rendering the iOS-only prompt in the first client render", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    })

    const html = renderToString(<IosPwaPrompt />)
    expect(html).not.toContain("Install tickward")

    document.body.innerHTML = `<div id="root">${html}</div>`
    const recoverableError = vi.fn()
    let root: Root | null = null

    await act(async () => {
      root = hydrateRoot(document.getElementById("root") as HTMLElement, <IosPwaPrompt />, {
        onRecoverableError: recoverableError,
      })
      await Promise.resolve()
    })

    expect(recoverableError).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText("Install tickward")).toBeInTheDocument())

    await act(async () => {
      root?.unmount()
    })
  })
})

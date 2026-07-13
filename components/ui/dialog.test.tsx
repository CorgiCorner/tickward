import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  isEventInsideToast,
} from "@/components/ui/dialog"

describe("DialogContent", () => {
  it("keeps direct header and footer outside the scroll body", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit timer</DialogTitle>
          </DialogHeader>
          <div>Scrollable body</div>
          <DialogFooter>
            <button type="button">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )

    const dialog = screen.getByRole("dialog", { name: "Edit timer" })
    const body = dialog.querySelector("[data-slot='dialog-body']")
    const headerRegion = dialog.querySelector("[data-slot='dialog-header-region']")
    const footerRegion = dialog.querySelector("[data-slot='dialog-footer-region']")

    expect(dialog).toHaveClass("overflow-hidden")
    expect(body).toHaveClass("overflow-y-auto")
    expect(body).toHaveTextContent("Scrollable body")
    expect(body).not.toHaveTextContent("Edit timer")
    expect(headerRegion).toHaveTextContent("Edit timer")
    expect(footerRegion).toHaveTextContent("Save")
  })
})

describe("isEventInsideToast", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("treats an element inside a sonner toast as inside (dialog must not close)", () => {
    document.body.innerHTML =
      '<div data-sonner-toaster><div data-sonner-toast><button type="button">Close</button></div></div>'
    const closeButton = document.querySelector("button")

    expect(isEventInsideToast(closeButton)).toBe(true)
    expect(isEventInsideToast(document.querySelector("[data-sonner-toast]"))).toBe(true)
  })

  it("treats a genuine outside click and a null target as outside (dialog closes normally)", () => {
    document.body.innerHTML = '<div id="outside">elsewhere</div>'

    expect(isEventInsideToast(document.getElementById("outside"))).toBe(false)
    expect(isEventInsideToast(null)).toBe(false)
  })
})

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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

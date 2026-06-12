import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FaqSection } from "@/components/faq-section"

describe("FaqSection", () => {
  it("renders a heading and FAQ cards", () => {
    render(
      <FaqSection
        heading="Frequently asked questions"
        faqs={[
          { question: "Is it free?", answer: "Yes, tickward is free and open source." },
          { question: "Can I share it?", answer: "Yes, every timer can have a read-only link." },
        ]}
      />,
    )

    expect(screen.getByRole("heading", { level: 2, name: "Frequently asked questions" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Is it free?" })).toBeInTheDocument()
    expect(screen.getByText("Yes, every timer can have a read-only link.")).toBeInTheDocument()
  })
})

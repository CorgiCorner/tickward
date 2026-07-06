import { describe, expect, it } from "vitest"

import { getHomeFaqs } from "@/lib/home-faqs"
import { SUPPORTED_LOCALES } from "@/lib/i18n/messages"

describe("home FAQs", () => {
  it("resolves a complete FAQ set for every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const faqs = getHomeFaqs(locale)
      const questions = faqs.map((faq) => faq.question)

      expect(faqs).toHaveLength(7)
      expect(new Set(questions).size).toBe(questions.length)

      for (const faq of faqs) {
        expect(faq.question.trim()).toBeTruthy()
        expect(faq.answer.trim()).toBeTruthy()
        expect(faq.answer).not.toMatch(/unlimited/i)
      }
    }
  })
})

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8")
const layout = readFileSync(path.join(__dirname, "[locale]", "layout.tsx"), "utf8")

function ruleBody(selector: string): string {
  const match = new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`).exec(css)
  return match?.[1] ?? ""
}

describe("global font", () => {
  it("defines the Geist variables on body, not on html", () => {
    expect(layout).toMatch(/<body className=\{`\$\{geistSans\.variable\}/)
    expect(layout).not.toMatch(/<html[^>]*geistSans/)
  })

  it("applies the sans stack on body, where the Geist variable exists", () => {
    // Tailwind's preflight sets the default font on html, which cannot see a
    // variable defined on body, so body text fell back to the system stack.
    expect(ruleBody("body")).toMatch(/@apply[^;]*\bfont-sans\b/)
  })
})

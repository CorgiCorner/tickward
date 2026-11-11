import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { FADE_EASING, MOTION_MS, MOVE_EASING } from "@/components/dashboard/motion"

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8")

function token(name: string) {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)
  return match?.[1].trim()
}

describe("motion tokens", () => {
  it("keeps the CSS curves and the script curves the same", () => {
    expect(token("ease-move")).toBe(MOVE_EASING)
    expect(token("ease-fade")).toBe(FADE_EASING)
  })

  it("keeps the CSS durations and the script durations the same", () => {
    for (const [step, ms] of Object.entries(MOTION_MS)) {
      expect(token(`transition-duration-${step}`)).toBe(`${ms}ms`)
    }
  })

  it("keeps UI motion between 120 and 260 ms, exits faster than entrances", () => {
    expect(Math.min(...Object.values(MOTION_MS))).toBeGreaterThanOrEqual(120)
    expect(Math.max(...Object.values(MOTION_MS))).toBeLessThanOrEqual(300)
    expect(MOTION_MS.exit).toBeLessThan(MOTION_MS.enter)
  })

  it("turns travel off with reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--motion-travel:\s*0;/)
  })
})

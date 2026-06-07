import { afterEach, describe, expect, it } from "vitest"

import { getDocsHref, getDocsSitemapPaths } from "@/lib/docs-config"

const originalDocsOrigin = process.env.TICKWARD_DOCS_ORIGIN

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

describe("docs config", () => {
  afterEach(() => {
    restoreEnv("TICKWARD_DOCS_ORIGIN", originalDocsOrigin)
  })

  it("keeps the footer docs link visible even when docs are handled outside Next", () => {
    delete process.env.TICKWARD_DOCS_ORIGIN

    expect(getDocsHref()).toBe("/docs")
    expect(getDocsSitemapPaths()).toEqual([])
  })
})

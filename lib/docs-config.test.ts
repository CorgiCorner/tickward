import { afterEach, describe, expect, it } from "vitest"

import { getDocsHref, getDocsPageHref, getDocsSitemapPaths } from "@/lib/docs-config"

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
    expect(getDocsPageHref("/guides/mcp")).toBe("/docs/guides/mcp")
    expect(getDocsSitemapPaths()).toEqual([])
  })

  it("links directly to the configured docs origin", () => {
    process.env.TICKWARD_DOCS_ORIGIN = "https://tickward.com/docs/"

    expect(getDocsHref()).toBe("https://tickward.com/docs")
    expect(getDocsPageHref("/guides/mcp")).toBe("https://tickward.com/docs/guides/mcp")
    expect(getDocsSitemapPaths()).toEqual([
      "/docs",
      "/docs/guides/self-hosting",
      "/docs/guides/api-quickstart",
      "/docs/guides/embedding-timers",
      "/docs/guides/webhooks",
      "/docs/guides/mcp",
      "/docs/guides/agent-usage",
      "/docs/guides/claude-code-codex-usage-limits",
      "/docs/concepts/countdown-accuracy",
      "/docs/concepts/started-counting-up",
      "/docs/concepts/recurrence",
      "/docs/concepts/notifications-and-alarms",
      "/docs/concepts/where-timers-live",
      "/docs/concepts/plans-and-limits",
      "/docs/concepts/sharing-model",
      "/docs/concepts/api-reliability",
      "/docs/guides/recipes/retry-safe-mutation",
      "/docs/guides/recipes/create-project-with-timers",
      "/docs/guides/recipes/preview-and-delete-project",
      "/docs/api-reference",
    ])
  })

  it("ignores invalid docs origins", () => {
    process.env.TICKWARD_DOCS_ORIGIN = "not a url"

    expect(getDocsHref()).toBe("/docs")
    expect(getDocsPageHref("guides/mcp")).toBe("/docs/guides/mcp")
    expect(getDocsSitemapPaths()).toEqual([])
  })
})

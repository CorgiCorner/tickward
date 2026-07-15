import { describe, expect, it } from "vitest"

import { parseDesktopFeed } from "@/lib/desktop-release"

const FEED = `version: 0.1.0
files:
  - url: Tickward Desktop-0.1.0-arm64-mac.zip
    sha512: abc
    size: 123
  - url: Tickward Desktop-0.1.0-arm64.dmg
    sha512: def
    size: 456
path: Tickward Desktop-0.1.0-arm64-mac.zip
releaseDate: '2026-07-09T00:00:00.000Z'
`

describe("parseDesktopFeed", () => {
  it("extracts the version and an encoded dmg url", () => {
    expect(parseDesktopFeed(FEED)).toEqual({
      version: "0.1.0",
      dmgUrl: "https://downloads.tickward.com/desktop/latest/Tickward%20Desktop-0.1.0-arm64.dmg",
    })
  })

  it("returns null when the feed lists no dmg", () => {
    const zipOnly = FEED.split("\n")
      .filter((line) => !line.includes(".dmg"))
      .join("\n")
    expect(parseDesktopFeed(zipOnly)).toBeNull()
  })

  it("returns null for malformed content", () => {
    expect(parseDesktopFeed("<html>not a feed</html>")).toBeNull()
  })

  it("handles a large malformed line without regex backtracking", () => {
    expect(parseDesktopFeed(`url: ${"x".repeat(100_000)}`)).toBeNull()
  })
})

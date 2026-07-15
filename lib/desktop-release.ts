// The desktop release feed is the electron-updater manifest the app itself
// polls. Reading it here keeps the download page pointing at the newest dmg
// without a site deploy per desktop release.
const DESKTOP_FEED_BASE_URL = "https://downloads.tickward.com/desktop/latest"
const FEED_REVALIDATE_SECONDS = 3600

export type DesktopRelease = Readonly<{
  dmgUrl: string
  version: string
}>

function encodeFeedPath(fileName: string): string {
  return fileName.split("/").map(encodeURIComponent).join("/")
}

function feedValue(line: string, key: string): string | null {
  const trimmed = line.trimStart()
  const normalized = trimmed.startsWith("-") ? trimmed.slice(1).trimStart() : trimmed
  const prefix = `${key}:`
  if (!normalized.startsWith(prefix)) return null
  const value = normalized.slice(prefix.length).trim()
  return value || null
}

// latest-mac.yml is a small flat YAML document; a full parser would be
// overkill for the two fields we need. Parsing it line by line also keeps the
// runtime linear for malformed or unexpectedly large feed content.
export function parseDesktopFeed(feed: string): DesktopRelease | null {
  let version: string | null = null
  let dmgFile: string | null = null
  for (const line of feed.split("\n")) {
    version ??= feedValue(line, "version")
    const url = feedValue(line, "url")
    if (url?.endsWith(".dmg")) dmgFile = url
    if (version && dmgFile) break
  }
  if (!version || !dmgFile) return null
  return {
    dmgUrl: `${DESKTOP_FEED_BASE_URL}/${encodeFeedPath(dmgFile)}`,
    version,
  }
}

export async function getLatestDesktopRelease(): Promise<DesktopRelease | null> {
  try {
    const response = await fetch(`${DESKTOP_FEED_BASE_URL}/latest-mac.yml`, {
      next: { revalidate: FEED_REVALIDATE_SECONDS },
    })
    if (!response.ok) return null
    return parseDesktopFeed(await response.text())
  } catch {
    // The page still renders with the Homebrew path when the feed is
    // unreachable (first release still uploading, DNS hiccup, etc.).
    return null
  }
}

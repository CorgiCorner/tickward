const LOCAL_SITE_URL = "http://localhost:3000"
const PUBLIC_SITE_URL = "https://tickward.com"

function trimTrailingSlash(value: string) {
  let end = value.length
  while (end > 0 && value[end - 1] === "/") end -= 1
  return value.slice(0, end)
}

export function getSiteUrl() {
  const configuredUrl = process.env.SITE_URL?.trim()
  const fallbackUrl = process.env.NODE_ENV === "production" ? PUBLIC_SITE_URL : LOCAL_SITE_URL
  const rawUrl = configuredUrl && configuredUrl.length > 0 ? configuredUrl : fallbackUrl
  try {
    return new URL(rawUrl)
  } catch {
    return new URL(fallbackUrl)
  }
}

export function getSiteOrigin() {
  return trimTrailingSlash(getSiteUrl().origin)
}

export function getSiteHostname() {
  return getSiteUrl().hostname
}

export type WwwToApexRedirect = {
  source: string
  has: [{ type: "host"; value: string }]
  destination: string
  permanent: true
}

// Host-level canonicalization: permanently redirect the www host to the apex
// host derived from SITE_URL so duplicate hosts do not serve identical content.
// Returns null when the configured host is not an apex domain (localhost,
// a www host, or a bare hostname), so forks keep full control via SITE_URL.
export function getWwwToApexRedirect(): WwwToApexRedirect | null {
  const siteUrl = getSiteUrl()
  const hostname = siteUrl.hostname
  if (hostname.startsWith("www.") || !hostname.includes(".")) return null

  return {
    source: "/:path*",
    has: [{ type: "host", value: `www.${hostname}` }],
    destination: `${siteUrl.protocol}//${hostname}/:path*`,
    permanent: true,
  }
}

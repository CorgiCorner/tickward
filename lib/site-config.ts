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

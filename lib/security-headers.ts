export const SHARED_SECURITY_HEADERS = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
] as const

function originSource(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}

function uniqueSources(sources: string[]) {
  return [...new Set(sources)]
}

export function contentSecurityPolicy(): string {
  const plausibleOrigin = originSource(process.env.NEXT_PUBLIC_PLAUSIBLE_URL)
  // When a Sentry-compatible DSN is configured, allow its browser monitor to
  // load and report: the Loader Script CDN in script-src and the DSN's ingest
  // origin in connect-src. Without these the loader is blocked by CSP and no
  // client error ever reaches the monitor. Stays empty when no DSN is set.
  // js.sentry-cdn.com serves the Loader Script; browser.sentry-cdn.com serves the
  // SDK bundle the loader then pulls in. Both must be allowed or the SDK is blocked.
  const sentryIngestOrigin = originSource(process.env.NEXT_PUBLIC_SENTRY_DSN)
  const sentryScriptSources = sentryIngestOrigin ? ["https://js.sentry-cdn.com", "https://browser.sentry-cdn.com"] : []
  const connectSrc = uniqueSources([
    "'self'",
    "https://api.github.com",
    ...(plausibleOrigin ? [plausibleOrigin] : []),
    // Sentry's loader fetches SDK source maps from this origin. Browsers apply
    // connect-src to those fetches, so script-src alone is not sufficient.
    ...(sentryIngestOrigin ? ["https://browser.sentry-cdn.com"] : []),
    ...(sentryIngestOrigin ? [sentryIngestOrigin] : []),
  ])
  const scriptSrc = uniqueSources([
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    ...(plausibleOrigin ? [plausibleOrigin] : []),
    ...sentryScriptSources,
  ])

  return [
    "default-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    // The CDN origin mirrors CDN_BASE_URL in lib/cdn.ts. It is inlined rather than
    // imported because proxy.ts ships in the public mirror and lib/cdn.ts is not
    // allowlisted - keep the two in sync. data: allows next/image blur placeholders.
    "img-src 'self' https://images.unsplash.com https://tickward-cdn.s3.us-east-1.amazonaws.com data: blob:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
  ].join("; ")
}

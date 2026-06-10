import { type NextRequest, NextResponse } from "next/server"
import { isRoutableShareId } from "@/lib/share-model"

const STATIC_SECURITY_HEADERS = [
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
] as const

// Agent-useful discovery links advertised on the home page (RFC 8288). Relative
// URIs resolve against the requested resource.
const DISCOVERY_LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</openapi.json>; rel="service-desc"; type="application/json"',
  '</docs/api-reference>; rel="service-doc"',
].join(", ")

function applySecurityHeaders(response: NextResponse): NextResponse {
  STATIC_SECURITY_HEADERS.forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  response.headers.set("Content-Security-Policy", contentSecurityPolicy())
  return response
}

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

function contentSecurityPolicy() {
  const plausibleOrigin = originSource(process.env.NEXT_PUBLIC_PLAUSIBLE_URL)
  const connectSrc = uniqueSources(["'self'", "https://api.github.com", ...(plausibleOrigin ? [plausibleOrigin] : [])])
  const scriptSrc = uniqueSources([
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    ...(plausibleOrigin ? [plausibleOrigin] : []),
  ])

  return [
    "default-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "img-src 'self' https://images.unsplash.com",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc.join(" ")}`,
  ].join("; ")
}

function handleHomepage(request: NextRequest): NextResponse {
  // Markdown for Agents: serve the markdown representation when negotiated.
  if ((request.headers.get("accept") ?? "").includes("text/markdown")) {
    const markdown = NextResponse.rewrite(new URL("/home.md", request.url))
    markdown.headers.set("Vary", "Accept")
    return applySecurityHeaders(markdown)
  }

  const response = NextResponse.next()
  response.headers.set("Link", DISCOVERY_LINK_HEADER)
  response.headers.set("Vary", "Accept")
  return applySecurityHeaders(response)
}

function parseForwardedHosts(value: string | null) {
  return (
    value
      ?.split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean) ?? []
  )
}

function isAllowedRequestOrigin(request: NextRequest, origin: string) {
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }

  const allowedHosts = new Set(
    [request.nextUrl.host, request.headers.get("host"), ...parseForwardedHosts(request.headers.get("x-forwarded-host"))]
      .filter((host): host is string => Boolean(host))
      .map((host) => host.toLowerCase()),
  )

  return allowedHosts.has(originHost)
}

function shareIdFromPathname(pathname: string) {
  const match = /^\/share\/([^/]+)\/?$/.exec(pathname)
  if (!match?.[1]) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return ""
  }
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return handleHomepage(request)
  }

  const shareId = shareIdFromPathname(request.nextUrl.pathname)
  if (shareId !== null && !isRoutableShareId(shareId)) {
    const response = new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
    return applySecurityHeaders(response)
  }

  const method = request.method
  const isMutating = method === "POST" || method === "DELETE"

  if (isMutating) {
    const origin = request.headers.get("Origin")
    if (origin && !isAllowedRequestOrigin(request, origin)) {
      const response = NextResponse.json({ error: "Forbidden" }, { status: 403 })
      return applySecurityHeaders(response)
    }
  }

  const response = NextResponse.next()
  return applySecurityHeaders(response)
}

export const config = {
  matcher: ["/", "/api/:path*", "/share/:path*"],
}

import { type NextRequest, NextResponse } from "next/server"
import { isRoutableShareId } from "@/lib/share-model"

const SECURITY_HEADERS = [
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https://images.unsplash.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  ],
] as const

function applySecurityHeaders(response: NextResponse): NextResponse {
  SECURITY_HEADERS.forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
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
  const match = pathname.match(/^\/share\/([^/]+)\/?$/)
  if (!match?.[1]) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return ""
  }
}

export async function proxy(request: NextRequest) {
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
  matcher: ["/api/:path*", "/share/:path*"],
}

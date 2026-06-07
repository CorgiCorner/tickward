import "server-only"

import { NextResponse } from "next/server"

const DOCS_ORIGIN_ENV = "TICKWARD_DOCS_ORIGIN"

function docsOrigin() {
  const value = process.env[DOCS_ORIGIN_ENV]?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.toString()
  } catch {
    return null
  }
}

export function redirectToDocs(request: Request, pathname: string) {
  const origin = docsOrigin()
  if (!origin) {
    return NextResponse.json(
      { error: { type: "not_found", message: "Documentation is not configured." } },
      { status: 404 },
    )
  }

  const requestUrl = new URL(request.url)
  const target = new URL(pathname, origin)
  target.search = requestUrl.search
  return NextResponse.redirect(target, 307)
}

export function redirectToDocsSubpath(request: Request, pathname: string) {
  const requestUrl = new URL(request.url)
  const cleanPathname = pathname.startsWith("/") ? pathname : `/${pathname}`
  const target = new URL(`/docs${cleanPathname}`, requestUrl.origin)
  target.search = requestUrl.search
  return NextResponse.redirect(target, 307)
}

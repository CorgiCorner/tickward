import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "edge"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const requestedPage = searchParams.get("page")?.trim()
  const page = requestedPage && requestedPage.length > 0 ? requestedPage : "1"

  if (!q) {
    return NextResponse.json({ results: [] })
  }

  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.unsplashNotConfigured, "errors.unsplashNotConfigured", { status: 500 })
  }

  const url = new URL("https://api.unsplash.com/search/photos")
  url.searchParams.set("query", q)
  url.searchParams.set("page", page)
  url.searchParams.set("per_page", "12")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${key}` },
  })

  if (!res.ok) {
    return apiErrorResponse(PUBLIC_ERROR_CODES.unsplashApi, "errors.unsplashApi", { status: res.status })
  }

  const data = (await res.json()) as {
    results: Array<{
      id: string
      urls: { thumb: string; small: string; regular: string }
      user: { name: string; links: { html: string } }
    }>
  }

  const results = data.results.map((r) => ({
    id: r.id,
    urls: { thumb: r.urls.thumb, small: r.urls.small, regular: r.urls.regular },
    user: { name: r.user.name, links: { html: r.user.links.html } },
  }))

  return NextResponse.json({ results })
}

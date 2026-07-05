"use client"

import { useEffect, useState } from "react"

export const GITHUB_REPO_URL = "https://github.com/CorgiCorner/tickward"

const GITHUB_REPO_API_URL = "https://api.github.com/repos/CorgiCorner/tickward"

let cachedStars: number | null = null
let starsRequest: Promise<number | null> | null = null

function fetchStars() {
  starsRequest ??= fetch(GITHUB_REPO_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as { stargazers_count?: unknown }
      return typeof data.stargazers_count === "number" ? data.stargazers_count : null
    })
    .catch(() => null)

  return starsRequest
}

export function useGitHubStars(): number | null {
  const [stars, setStars] = useState<number | null>(null)

  useEffect(() => {
    if (cachedStars !== null) {
      const nextStars = cachedStars
      queueMicrotask(() => setStars(nextStars))
      return
    }

    void fetchStars().then((nextStars) => {
      if (typeof nextStars === "number") {
        cachedStars = nextStars
        setStars(nextStars)
      }
    })
  }, [])

  return stars
}

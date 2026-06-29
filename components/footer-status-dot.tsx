"use client"

import { useEffect, useState } from "react"

import { type ServiceStatusLevel, statusDotClass } from "@/lib/status-summary"
import { cn } from "@/lib/utils"

// Footer service-status dot. Fetched client-side from the same-origin
// /api/status-summary proxy (the status page itself sends no CORS headers).
// Starts neutral and never throws on a failed fetch, so the footer stays sync
// and server-renderable.
export function FooterStatusDot() {
  const [level, setLevel] = useState<ServiceStatusLevel>("unknown")

  useEffect(() => {
    let active = true
    fetch("/api/status-summary")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.level) setLevel(data.level as ServiceStatusLevel)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return <span aria-hidden="true" className={cn("size-1.5 rounded-full", statusDotClass(level))} />
}

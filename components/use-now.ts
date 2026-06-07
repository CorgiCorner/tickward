"use client"

import { useEffect, useState } from "react"

export function useNow(intervalMs = 1000) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = globalThis.setInterval(() => setNowMs(Date.now()), intervalMs)
    return () => globalThis.clearInterval(id)
  }, [intervalMs])

  return nowMs
}

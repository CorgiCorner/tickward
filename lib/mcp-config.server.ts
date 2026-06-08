import "server-only"

import { optionalServerEnv } from "@/lib/env.server"

export function getMcpRemoteUrl() {
  const value = optionalServerEnv("TICKWARD_MCP_REMOTE_URL")
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.toString()
  } catch {
    return null
  }
}

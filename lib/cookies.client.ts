"use client"

import { TD_RESTORE_KEY_COOKIE, TD_SPACES_COOKIE, TD_TIMERS_COOKIE, encodeBase64Json } from "./cookies"

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  const secure = globalThis.window !== undefined && globalThis.location.protocol === "https:" ? "; Secure" : ""
  // biome-ignore lint/suspicious/noDocumentCookie: required for client persistence per PRD (SSR reads it server-side)
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`
}

export function writeTimersCookie(timers: unknown) {
  const encoded = encodeBase64Json(timers)
  // 365 days
  setCookie(TD_TIMERS_COOKIE, encoded, 60 * 60 * 24 * 365)
}

export function writeSpacesCookie(spaces: unknown) {
  const encoded = encodeBase64Json(spaces)
  setCookie(TD_SPACES_COOKIE, encoded, 60 * 60 * 24 * 365)
}

// Security note: The restore key cookie is intentionally NOT HttpOnly.
// It must be readable by client-side JS for the store hydration flow.
// Protection relies on SameSite=Lax (set below) and CSRF origin checks in proxy.ts.
export function writeRestoreKeyCookie(key: string | null) {
  if (!key) {
    setCookie(TD_RESTORE_KEY_COOKIE, "", 0)
    return
  }
  setCookie(TD_RESTORE_KEY_COOKIE, key, 60 * 60 * 24 * 365)
}

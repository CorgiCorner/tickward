import "server-only"

import { cookies } from "next/headers"
import { TD_RESTORE_KEY_COOKIE, TD_SPACES_COOKIE, TD_TIMERS_COOKIE, decodeBase64Json } from "./cookies"

export async function readTimersCookie<T>(): Promise<T | null> {
  const jar = await cookies()
  const raw = jar.get(TD_TIMERS_COOKIE)?.value
  if (!raw) return null
  const decoded = decodeBase64Json<T>(decodeURIComponent(raw))
  return decoded
}

export async function readSpacesCookie<T>(): Promise<T | null> {
  const jar = await cookies()
  const raw = jar.get(TD_SPACES_COOKIE)?.value
  if (!raw) return null
  const decoded = decodeBase64Json<T>(decodeURIComponent(raw))
  return decoded
}

export async function readRestoreKeyCookie() {
  const jar = await cookies()
  return jar.get(TD_RESTORE_KEY_COOKIE)?.value ?? null
}

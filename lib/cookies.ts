export const TD_TIMERS_COOKIE = "td_timers"
export const TD_RESTORE_KEY_COOKIE = "td_restoreKey"
export const TD_SPACES_COOKIE = "td_spaces"

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCodePoint(byte)
  return btoa(binary)
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0
  return bytes
}

export function encodeBase64Json(value: unknown) {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  return bytesToBase64(bytes)
}

export function decodeBase64Json<T>(base64: string): T | null {
  try {
    const bytes = base64ToBytes(base64)
    const json = new TextDecoder().decode(bytes)
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

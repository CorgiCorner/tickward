// Shared identifier validation. Restore keys and share ids use the same
// URL-safe token format; keep this module dependency-free so it stays safe to
// import from client, edge, and server code alike.

export const ID_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export function isValidRestoreKey(key: string) {
  return ID_TOKEN_PATTERN.test(key)
}

export function isValidShareId(id: string) {
  return ID_TOKEN_PATTERN.test(id)
}

export function isRoutableShareId(id: string) {
  return isValidShareId(id) && (id.startsWith("timer_") || id.startsWith("share_"))
}

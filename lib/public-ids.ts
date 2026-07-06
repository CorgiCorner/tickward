import { nanoid } from "nanoid"

// New public object ids are opaque, URL-safe strings with a type prefix so
// they are self-describing in URLs, logs, and API payloads. The prefix is a
// generation convention, not a validation rule: ids created before prefixing
// and client-supplied ids remain valid. Share ids already carry their own
// prefixes (share_..., timer_<digest> for shared timers) elsewhere.
export const PUBLIC_ID_PREFIXES = {
  project: "project",
  timer: "timer",
  space: "space",
  restoreKey: "rk",
} as const

export type PublicIdKind = keyof typeof PUBLIC_ID_PREFIXES

export function newPublicId(kind: PublicIdKind) {
  return `${PUBLIC_ID_PREFIXES[kind]}_${nanoid(12)}`
}

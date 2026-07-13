import "server-only"

import { createHash } from "node:crypto"

import type { Actor } from "@/lib/contracts"
import { hashRestoreKeyToken } from "@/lib/auth/restore-key-token.server"

type StaticShareIdInput = {
  kind: "timer"
  actor: Actor
  entityId: string
}

function actorShareScope(actor: Actor) {
  if (actor.kind === "anonymous") return `restore:${hashRestoreKeyToken(actor.restoreKey)}`
  if (actor.restoreKey) return `restore:${hashRestoreKeyToken(actor.restoreKey)}`
  return `user:${actor.user.id}`
}

export function stableShareId(input: StaticShareIdInput) {
  // This is a deterministic, opaque public record id, not a password verifier.
  // The owner scope and entity id are domain-separated by the share kind. The
  // exact digest must remain stable so existing share and embed URLs keep working.
  // codeql[js/insufficient-password-hash]
  const digest = createHash("sha256")
    .update(`tickward:${input.kind}-share:${actorShareScope(input.actor)}:${input.entityId}`, "utf8")
    .digest("base64url")
  return `timer_${digest}`
}

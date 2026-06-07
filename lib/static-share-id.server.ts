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
  const digest = createHash("sha256")
    .update(`tickward:${input.kind}-share:${actorShareScope(input.actor)}:${input.entityId}`, "utf8")
    .digest("base64url")
  return `timer_${digest}`
}

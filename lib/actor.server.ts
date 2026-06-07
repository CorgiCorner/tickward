import "server-only"

import type { Actor } from "@/lib/contracts"
import { formatMessage } from "@/lib/i18n/messages"
import { getServerAdapters } from "@/lib/server-adapters.server"

export type GetCurrentActorInput = {
  restoreKey?: string | null
  request?: Request
}

/**
 * Resolves the actor performing the current request.
 *
 * Today there is no session lookup: every caller is anonymous and the restore
 * key is the only thing identifying them. Once Better Auth lands, this will
 * first resolve a user session and fall back to anonymous only when no session
 * is present. At that point the restore key is demoted to an anonymous project
 * access token, not an identity model.
 */
export async function getCurrentActor(input: GetCurrentActorInput): Promise<Actor> {
  const actor = await getServerAdapters().resolveActor(input)
  if (actor) return actor

  throw new Error(formatMessage("errors.actorUnavailable"))
}

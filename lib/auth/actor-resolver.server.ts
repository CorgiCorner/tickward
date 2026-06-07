import "server-only"

import type { Actor } from "@/lib/contracts"
import { getTickwardAuth } from "@/lib/auth/auth.server"
import type { UserRole } from "@/lib/auth/permissions"
import type { ActorResolverInput } from "@/lib/server-extension-points.server"

/**
 * Resolves Better Auth sessions into Tickward actors.
 */
export async function resolveBetterAuthActor(input: ActorResolverInput): Promise<Actor | null> {
  return resolveSessionActor(input)
}

async function resolveSessionActor(input: ActorResolverInput): Promise<Actor | null> {
  if (!input.request) return null

  let session: Awaited<ReturnType<NonNullable<ReturnType<typeof getTickwardAuth>>["api"]["getSession"]>>
  try {
    const auth = getTickwardAuth()
    if (!auth) return null

    session = await auth.api.getSession({
      headers: input.request.headers,
    })
  } catch {
    return null
  }

  const user = session?.user as Record<string, unknown> | undefined
  if (!user || typeof user.id !== "string") return null

  const email = typeof user.email === "string" ? user.email : undefined

  return {
    kind: "user",
    user: { id: user.id, email, role: normalizeRole(user.role) },
    restoreKey: input.restoreKey?.trim() ? input.restoreKey.trim() : undefined,
  }
}

function normalizeRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user"
}

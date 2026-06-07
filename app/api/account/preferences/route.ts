import { getCurrentActor } from "@/lib/actor.server"
import { accountPreferencesPatchSchema } from "@/lib/account-preferences"
import { getAccountPreferencesForUser, updateAccountPreferencesForUser } from "@/lib/account-preferences.server"
import { apiError, apiJson, isResponse } from "@/lib/api-response"
import type { UserActor } from "@/lib/contracts"

export const runtime = "nodejs"

async function signedInUser(req: Request): Promise<UserActor | Response> {
  try {
    const actor = await getCurrentActor({ request: req })
    if (actor.kind === "user") return actor
  } catch {}
  return apiError("unauthorized", "Sign in to manage account settings.", { status: 401 })
}

async function readJson(req: Request) {
  try {
    return await req.json()
  } catch {
    return apiError("validation_error", "Request body must be valid JSON.", { status: 400 })
  }
}

function preferencesStorageUnavailable(operation: string, error: unknown) {
  console.error(`[tickward] accountPreferences.${operation}`, error)
  return apiError("storage_unavailable", "Settings storage is unavailable.", { status: 503 })
}

export async function GET(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  try {
    const preferences = await getAccountPreferencesForUser(actor.user)
    return apiJson(preferences, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return preferencesStorageUnavailable("get", error)
  }
}

export async function PATCH(req: Request) {
  const actor = await signedInUser(req)
  if (isResponse(actor)) return actor

  const body = await readJson(req)
  if (isResponse(body)) return body

  const parsed = accountPreferencesPatchSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "We found an error with one or more fields in the request.", {
      details: parsed.error.issues.map((issue) => ({ message: issue.message, path: issue.path })),
      status: 400,
    })
  }

  try {
    const preferences = await updateAccountPreferencesForUser(actor.user, parsed.data)
    return apiJson(preferences, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return preferencesStorageUnavailable("update", error)
  }
}

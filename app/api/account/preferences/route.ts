import { accountPreferencesPatchSchema } from "@/lib/account-preferences"
import { getAccountPreferencesForUser, updateAccountPreferencesForUser } from "@/lib/account-preferences.server"
import { apiError, apiJson, isResponse } from "@/lib/api-response"
import {
  accountRouteStorageUnavailable,
  readAccountRouteJson,
  requireSignedInUser,
} from "@/lib/account-api-route.server"

export const runtime = "nodejs"

function preferencesStorageUnavailable(operation: string, error: unknown) {
  return accountRouteStorageUnavailable({
    error,
    logName: "accountPreferences",
    message: "Settings storage is unavailable.",
    operation,
  })
}

export async function GET(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to manage account settings.")
  if (isResponse(actor)) return actor

  try {
    const preferences = await getAccountPreferencesForUser(actor.user)
    return apiJson(preferences, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return preferencesStorageUnavailable("get", error)
  }
}

export async function PATCH(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to manage account settings.")
  if (isResponse(actor)) return actor

  const body = await readAccountRouteJson(req)
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

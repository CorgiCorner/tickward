import { accountImportRequestSchema } from "@/lib/account-migration"
import { importAccountProjects } from "@/lib/account-migration.server"
import {
  accountRouteStorageUnavailable,
  enforceAccountRateLimit,
  readAccountRouteJson,
  requireSignedInUser,
} from "@/lib/account-api-route.server"
import { apiError, apiJson, isResponse } from "@/lib/api-response"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const actor = await requireSignedInUser(req, "Sign in to import account data.")
  if (isResponse(actor)) return actor

  const rateLimit = await enforceAccountRateLimit({ bucket: "account-import", key: `user:${actor.user.id}` })
  if (rateLimit) return rateLimit

  const body = await readAccountRouteJson(req)
  if (isResponse(body)) return body

  const parsed = accountImportRequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "The account export file is invalid or unsupported.", {
      details: parsed.error.issues.map((issue) => ({ message: issue.message, path: issue.path })),
      status: 400,
    })
  }

  try {
    const result = await importAccountProjects(actor, parsed.data)
    if (!result) {
      return apiError("not_supported", "Account import is not supported by this deployment.", { status: 501 })
    }
    return apiJson(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return accountRouteStorageUnavailable({
      error,
      logName: "accountImport",
      message: "Account import storage is unavailable.",
      operation: "import",
    })
  }
}

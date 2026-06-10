import { apiError, apiJson } from "@/lib/api-response"
import { runWebhookSchedulerTick, verifySchedulerSecret } from "@/lib/webhooks.server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  if (!verifySchedulerSecret(req.headers.get("authorization"))) {
    return apiError("unauthorized", "Scheduler authorization failed.", { status: 401 })
  }

  try {
    const result = await runWebhookSchedulerTick()
    return apiJson({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[tickward] scheduler.tick", error)
    return apiError("storage_unavailable", "Scheduler storage is unavailable.", { status: 503 })
  }
}

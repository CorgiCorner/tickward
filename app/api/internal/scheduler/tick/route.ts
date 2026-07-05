import { apiError, apiJson } from "@/lib/api-response"
import { deliverDueTimerReminders } from "@/lib/timer-reminders.server"
import { runWebhookSchedulerTick, verifySchedulerSecret } from "@/lib/webhooks.server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  if (!verifySchedulerSecret(req.headers.get("authorization"))) {
    return apiError("unauthorized", "Scheduler authorization failed.", { status: 401 })
  }

  // Webhooks and reminders are independent failure domains: a crash in one
  // must not discard the other's completed work for this tick.
  const [webhooksResult, remindersResult] = await Promise.allSettled([
    runWebhookSchedulerTick(),
    deliverDueTimerReminders(),
  ])
  if (webhooksResult.status === "rejected") {
    console.error("[tickward] scheduler.tick webhooks", webhooksResult.reason)
  }
  if (remindersResult.status === "rejected") {
    console.error("[tickward] scheduler.tick reminders", remindersResult.reason)
  }
  if (webhooksResult.status === "rejected" || remindersResult.status === "rejected") {
    return apiError("storage_unavailable", "Scheduler storage is unavailable.", { status: 503 })
  }

  const reminders = remindersResult.value
  return apiJson(
    {
      ok: true,
      ...webhooksResult.value,
      timer_reminders_delivered: reminders.delivered,
      timer_reminders_failed: reminders.failed,
      timer_reminders_picked: reminders.picked,
      timer_reminders_skipped: reminders.skipped,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

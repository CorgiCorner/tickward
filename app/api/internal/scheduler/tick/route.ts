import { apiError, apiJson } from "@/lib/api-response"
import { purgeOldAuditEvents } from "@/lib/audit-log.server"
import { sweepOverLimitProjects } from "@/lib/over-limit-project-gc.server"
import { collectOwnerlessProjects } from "@/lib/ownerless-project-gc.server"
import { deliverDueTimerReminders } from "@/lib/timer-reminders.server"
import { runWebhookSchedulerTick, verifySchedulerSecret } from "@/lib/webhooks.server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  if (!verifySchedulerSecret(req.headers.get("authorization"))) {
    return apiError("unauthorized", "Scheduler authorization failed.", { status: 401 })
  }

  // Webhooks, reminders, cleanup, and audit-log purging are independent
  // failure domains: a crash in one must not discard the others' completed
  // work for this tick.
  const [webhooksResult, remindersResult, ownerlessProjectsResult, overLimitProjectsResult, auditPurgeResult] =
    await Promise.allSettled([
      runWebhookSchedulerTick(),
      deliverDueTimerReminders(),
      collectOwnerlessProjects(),
      sweepOverLimitProjects(),
      purgeOldAuditEvents(),
    ])
  if (webhooksResult.status === "rejected") {
    console.error("[tickward] scheduler.tick webhooks", webhooksResult.reason)
  }
  if (remindersResult.status === "rejected") {
    console.error("[tickward] scheduler.tick reminders", remindersResult.reason)
  }
  if (ownerlessProjectsResult.status === "rejected") {
    console.error("[tickward] scheduler.tick ownerlessProjects", ownerlessProjectsResult.reason)
  }
  if (overLimitProjectsResult.status === "rejected") {
    console.error("[tickward] scheduler.tick overLimitProjects", overLimitProjectsResult.reason)
  }
  if (auditPurgeResult.status === "rejected") {
    console.error("[tickward] scheduler.tick audit", auditPurgeResult.reason)
  }
  if (
    webhooksResult.status === "rejected" ||
    remindersResult.status === "rejected" ||
    ownerlessProjectsResult.status === "rejected"
  ) {
    return apiError("storage_unavailable", "Scheduler storage is unavailable.", { status: 503 })
  }

  const reminders = remindersResult.value
  const ownerlessProjects = ownerlessProjectsResult.value
  const overLimitProjects =
    overLimitProjectsResult.status === "fulfilled"
      ? overLimitProjectsResult.value
      : { stamped: 0, unstamped: 0, deleted: 0, alertsSent: 0 }
  const auditEventsPurged = auditPurgeResult.status === "fulfilled" ? auditPurgeResult.value : 0
  return apiJson(
    {
      audit_events_purged: auditEventsPurged,
      ok: true,
      ...webhooksResult.value,
      over_limit_alerts_sent: overLimitProjects.alertsSent,
      over_limit_projects_deleted: overLimitProjects.deleted,
      over_limit_projects_stamped: overLimitProjects.stamped,
      over_limit_projects_unstamped: overLimitProjects.unstamped,
      ownerless_project_shares_deleted: ownerlessProjects.deletedShares,
      ownerless_projects_deleted: ownerlessProjects.deletedProjects,
      timer_reminders_delivered: reminders.delivered,
      timer_reminders_failed: reminders.failed,
      timer_reminders_picked: reminders.picked,
      timer_reminders_skipped: reminders.skipped,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

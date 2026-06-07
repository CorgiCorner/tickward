import "server-only"

import { resendMailProvider } from "@/lib/adapters/resend-mail-provider.server"
import type { MailProvider } from "@/lib/mail-provider"
import type {
  DeliveryResult,
  NotificationDeliveryProvider,
  TimerFinishedDeliveryCommand,
} from "@/lib/notification-delivery"

function skipped(channel: DeliveryResult["channel"], reason: string, providerId = "none"): DeliveryResult {
  return { channel, status: "skipped", reason, providerId, attemptCount: 0, successCount: 0, failureCount: 0 }
}

function failed(channel: DeliveryResult["channel"], reason: string, providerId: string): DeliveryResult {
  return { channel, status: "failed", reason, providerId, attemptCount: 1, successCount: 0, failureCount: 1 }
}

async function sendEmail(mailProvider: MailProvider, command: TimerFinishedDeliveryCommand): Promise<DeliveryResult> {
  if (!command.recipient.email) return skipped("email", "missing_recipient")
  if (!mailProvider.isConfigured()) return skipped("email", "provider_not_configured", mailProvider.id)

  try {
    await mailProvider.sendTimerFinishedEmail({
      to: command.recipient.email,
      timerId: command.timerId,
      label: command.label,
      targetDate: command.targetDate,
      timezone: command.timezone,
    })
    return {
      channel: "email",
      status: "sent",
      providerId: mailProvider.id,
      attemptCount: 1,
      successCount: 1,
      failureCount: 0,
    }
  } catch (error) {
    return failed("email", error instanceof Error ? error.message : "send_failed", mailProvider.id)
  }
}

export function createMailNotificationDeliveryProvider(mailProvider: MailProvider): NotificationDeliveryProvider {
  return {
    async sendTimerFinished(command) {
      if (!command.channels.includes("email")) return []
      return [await sendEmail(mailProvider, command)]
    },
  }
}

export const resendNotificationDeliveryProvider = createMailNotificationDeliveryProvider(resendMailProvider)

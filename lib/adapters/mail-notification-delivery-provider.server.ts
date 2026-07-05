import "server-only"

import { resendMailProvider } from "@/lib/adapters/resend-mail-provider.server"
import type { MailProvider } from "@/lib/mail-provider"
import type {
  DeliveryResult,
  NotificationDeliveryProvider,
  TimerFinishedDeliveryCommand,
  TimerReminderDeliveryCommand,
} from "@/lib/notification-delivery"
import type { NotificationChannel } from "@/lib/notification-preferences"

export type NotificationChannelProvider = {
  channel: NotificationChannel
  providerId: string
  sendTimerFinished(command: TimerFinishedDeliveryCommand): Promise<DeliveryResult>
  sendTimerReminder?(command: TimerReminderDeliveryCommand): Promise<DeliveryResult>
}

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

async function sendReminderEmail(
  mailProvider: MailProvider,
  command: TimerReminderDeliveryCommand,
): Promise<DeliveryResult> {
  if (!command.recipient.email) return skipped("email", "missing_recipient")
  if (!mailProvider.isConfigured()) return skipped("email", "provider_not_configured", mailProvider.id)

  try {
    await mailProvider.sendTimerReminderEmail({
      to: command.recipient.email,
      timerId: command.timerId,
      label: command.label,
      targetDate: command.occurrenceAt,
      timezone: command.timezone,
      offsetMinutes: command.offsetMinutes,
      occurrenceAt: command.occurrenceAt,
      transactionId: command.transactionId,
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

export function createMailNotificationChannelProvider(mailProvider: MailProvider): NotificationChannelProvider {
  return {
    channel: "email",
    providerId: mailProvider.id,
    sendTimerFinished: (command) => sendEmail(mailProvider, command),
    sendTimerReminder: (command) => sendReminderEmail(mailProvider, command),
  }
}

export function createMailNotificationDeliveryProvider(mailProvider: MailProvider): NotificationDeliveryProvider {
  const provider = createMailNotificationChannelProvider(mailProvider)

  return {
    async sendTimerFinished(command) {
      const results: DeliveryResult[] = []
      for (const channel of command.channels) {
        results.push(
          channel === provider.channel
            ? await provider.sendTimerFinished(command)
            : skipped(channel, "provider_not_configured"),
        )
      }
      return results
    },
    async sendTimerReminder(command) {
      const results: DeliveryResult[] = []
      for (const channel of command.channels) {
        results.push(
          channel === provider.channel && provider.sendTimerReminder
            ? await provider.sendTimerReminder(command)
            : skipped(channel, "provider_not_configured"),
        )
      }
      return results
    },
  }
}

export const resendNotificationDeliveryProvider = createMailNotificationDeliveryProvider(resendMailProvider)

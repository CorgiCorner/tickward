import "server-only"

import { createInAppNotificationChannelProvider } from "@/lib/adapters/in-app-notification-channel-provider.server"
import { createMailNotificationChannelProvider } from "@/lib/adapters/mail-notification-delivery-provider.server"
import { resendMailProvider } from "@/lib/adapters/resend-mail-provider.server"
import { resolveBetterAuthActor } from "@/lib/auth/actor-resolver.server"
import { noopErrorMonitor } from "@/lib/error-monitor"
import type {
  DeliveryResult,
  NotificationDeliveryProvider,
  TimerFinishedDeliveryCommand,
  TimerReminderDeliveryCommand,
} from "@/lib/notification-delivery"
import type { NotificationChannel } from "@/lib/notification-preferences"
import type { ServerExtensions } from "@/lib/server-extension-points.server"

type ChannelProvider = {
  channel: NotificationChannel
  providerId: string
  sendTimerFinished(command: TimerFinishedDeliveryCommand): Promise<DeliveryResult>
  sendTimerReminder?(command: TimerReminderDeliveryCommand): Promise<DeliveryResult>
}

function skipped(channel: NotificationChannel): DeliveryResult {
  return {
    channel,
    status: "skipped",
    reason: "provider_not_configured",
    providerId: "none",
    attemptCount: 0,
    successCount: 0,
    failureCount: 0,
  }
}

function createNotificationDeliveryProvider(providers: ChannelProvider[]): NotificationDeliveryProvider {
  return {
    async sendTimerFinished(command) {
      const results: DeliveryResult[] = []
      for (const channel of command.channels) {
        const provider = providers.find((candidate) => candidate.channel === channel)
        results.push(provider ? await provider.sendTimerFinished(command) : skipped(channel))
      }
      return results
    },
    async sendTimerReminder(command) {
      const results: DeliveryResult[] = []
      for (const channel of command.channels) {
        const provider = providers.find((candidate) => candidate.channel === channel && candidate.sendTimerReminder)
        results.push(provider?.sendTimerReminder ? await provider.sendTimerReminder(command) : skipped(channel))
      }
      return results
    },
  }
}

const notificationDeliveryProvider = createNotificationDeliveryProvider([
  createInAppNotificationChannelProvider(),
  createMailNotificationChannelProvider(resendMailProvider),
])

export const serverExtensions: ServerExtensions = {
  resolveActor: resolveBetterAuthActor,
  notificationDeliveryProvider,
  mailProvider: resendMailProvider,
  errorMonitor: noopErrorMonitor,
}

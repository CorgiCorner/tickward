import "server-only"

import { resendNotificationDeliveryProvider } from "@/lib/adapters/mail-notification-delivery-provider.server"
import { resendMailProvider } from "@/lib/adapters/resend-mail-provider.server"
import { resolveBetterAuthActor } from "@/lib/auth/actor-resolver.server"
import type { ServerExtensions } from "@/lib/server-extension-points.server"

export const serverExtensions: ServerExtensions = {
  resolveActor: resolveBetterAuthActor,
  notificationDeliveryProvider: resendNotificationDeliveryProvider,
  mailProvider: resendMailProvider,
}

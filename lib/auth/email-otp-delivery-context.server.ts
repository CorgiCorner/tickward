import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

type EmailOtpDeliveryContext = {
  failed: boolean
}

const emailOtpDeliveryContext = new AsyncLocalStorage<EmailOtpDeliveryContext>()

export async function trackEmailOtpDelivery<T>(task: () => Promise<T>) {
  const context: EmailOtpDeliveryContext = { failed: false }
  const value = await emailOtpDeliveryContext.run(context, task)
  return { deliveryFailed: context.failed, value }
}

export function recordEmailOtpDeliveryFailure() {
  const context = emailOtpDeliveryContext.getStore()
  if (context) context.failed = true
}

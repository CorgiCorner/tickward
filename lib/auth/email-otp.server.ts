import "server-only"

import { formatMessage } from "@/lib/i18n/messages"
import type { EmailOtpType, MailProvider } from "@/lib/mail-provider"
import { getServerAdapters } from "@/lib/server-adapters.server"

function requireEmailOtpProvider(): MailProvider {
  const { mailProvider } = getServerAdapters()
  if (!mailProvider.isConfigured()) {
    throw new Error(formatMessage("errors.emailOtpProviderNotConfigured"))
  }
  return mailProvider
}

export function assertEmailOtpProviderConfigured() {
  requireEmailOtpProvider()
}

export async function sendEmailOtpMessage(input: { email: string; otp: string; type: EmailOtpType }) {
  const mailProvider = requireEmailOtpProvider()
  await mailProvider.sendEmailOtp({
    to: input.email,
    otp: input.otp,
    type: input.type,
  })
}

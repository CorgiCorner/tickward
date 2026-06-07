// v0.2 mail provider port.
//
// Services depend on this interface instead of a concrete email client so a
// future transactional provider can send timer notifications without touching
// domain or API code. This module performs no IO and requires no environment
// variables at runtime; it is safe to import anywhere.
//
// Wire-format note: the command carries `targetDate` (ISO string) plus
// `timezone`, matching the Timer contract, so renderers can format the same
// values that storage persists.

export type TimerFinishedEmailCommand = {
  to: string
  timerId: string
  label: string
  targetDate: string
  timezone: string
}

export type EmailOtpType = "sign-in" | "email-verification" | "forget-password" | "change-email"

export type EmailOtpCommand = {
  to: string
  otp: string
  type: EmailOtpType
}

export interface MailProvider {
  id: string
  isConfigured(): boolean
  sendTimerFinishedEmail(command: TimerFinishedEmailCommand): Promise<void>
  sendEmailOtp(command: EmailOtpCommand): Promise<void>
}

/**
 * Default provider that does nothing. A Resend-backed adapter replaces this
 * later behind the same port; no env vars are required at runtime until then.
 */
export const nullMailProvider: MailProvider = {
  id: "none",
  isConfigured() {
    return false
  },
  async sendTimerFinishedEmail(): Promise<void> {},
  async sendEmailOtp(): Promise<void> {},
}

export function getMailProvider(): MailProvider {
  return nullMailProvider
}

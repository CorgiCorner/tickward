import "server-only"

import { DEFAULT_LOCALE, formatMessage, localeHref } from "@/lib/i18n/messages"
import type {
  EmailOtpCommand,
  EmailOtpType,
  MailProvider,
  TimerFinishedEmailCommand,
  TimerReminderEmailCommand,
  WebhookEndpointDisabledEmailCommand,
} from "@/lib/mail-provider"
import { getResendConfig } from "@/lib/private-config.server"
import { getSiteOrigin } from "@/lib/site-config"
import { milestoneNotificationCopy } from "@/lib/milestone-notification"
import { formatTimerReminderOffset } from "@/lib/timer-reminder-offset"

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function timerEmailHtml(command: TimerFinishedEmailCommand) {
  const label = escapeHtml(command.label)
  const targetDate = escapeHtml(command.targetDate)
  const timezone = escapeHtml(command.timezone)
  const body = formatMessage("email.timerFinished.body", { label: `<strong>${label}</strong>` })
  const when = formatMessage("email.timerFinished.when", { targetDate, timezone })
  return `<p>${body}</p><p>${when}</p>`
}

function timerReminderEmailHtml(command: TimerReminderEmailCommand) {
  const label = escapeHtml(command.label)
  const occurrenceAt = escapeHtml(command.occurrenceAt)
  const timezone = escapeHtml(command.timezone)
  const offset = escapeHtml(formatTimerReminderOffset(command.offsetMinutes))
  const settingsUrl = escapeHtml(`${getSiteOrigin()}${localeHref(DEFAULT_LOCALE, "/settings")}#alerts`)
  const heading = formatMessage("email.timerReminder.heading")
  const body = command.milestone
    ? milestoneNotificationCopy({
        label: `<strong>${label}</strong>`,
        milestone: command.milestone,
        offsetMinutes: command.offsetMinutes,
      }).body
    : formatMessage("email.timerReminder.body", {
        label: `<strong>${label}</strong>`,
        occurrenceAt,
        offset,
        timezone,
      })
  const manage = formatMessage("email.timerReminder.manage")
  return `<h1>${heading}</h1><p>${body}</p><p><a href="${settingsUrl}">${manage}</a></p>`
}

function otpSubject(type: EmailOtpType) {
  if (type === "email-verification") return formatMessage("email.otp.subject.emailVerification")
  if (type === "forget-password") return formatMessage("email.otp.subject.forgetPassword")
  if (type === "change-email") return formatMessage("email.otp.subject.changeEmail")
  return formatMessage("email.otp.subject.signIn")
}

function otpEmailHtml(command: EmailOtpCommand) {
  const otp = escapeHtml(command.otp)
  const body = formatMessage("email.otp.body", { otp: `<strong>${otp}</strong>` })
  const expires = formatMessage("email.otp.expires")
  return `<p>${body}</p><p>${expires}</p>`
}

function webhookDisabledEmailHtml(command: WebhookEndpointDisabledEmailCommand) {
  const body = formatMessage("email.webhookDisabled.body", {
    count: command.failureCount,
    name: `<strong>${escapeHtml(command.endpointName)}</strong>`,
    url: escapeHtml(command.endpointUrl),
  })
  const action = formatMessage("email.webhookDisabled.action")
  return `<p>${body}</p><p>${action}</p>`
}

function resendHeaders(config: { apiKey: string }, idempotencyKey?: string) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "tickward/1.0",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  }
}

function resendPayload(config: { from: string; replyTo?: string }, payload: Record<string, unknown>) {
  return {
    from: config.from,
    ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    ...payload,
  }
}

export const resendMailProvider: MailProvider = {
  id: "resend",
  isConfigured() {
    return Boolean(getResendConfig())
  },
  async sendTimerFinishedEmail(command: TimerFinishedEmailCommand): Promise<void> {
    const config = getResendConfig()
    if (!config) return

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: resendHeaders(config, `timer-email:${command.timerId}:${command.targetDate}`),
      body: JSON.stringify(
        resendPayload(config, {
          to: [command.to],
          subject: formatMessage("email.timerFinished.subject", { label: command.label }),
          html: timerEmailHtml(command),
        }),
      ),
    })

    if (!res.ok) {
      throw new Error(formatMessage("errors.resendEmailFailed", { status: res.status }))
    }
  },
  async sendTimerReminderEmail(command: TimerReminderEmailCommand): Promise<void> {
    const config = getResendConfig()
    if (!config) return

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: resendHeaders(config, command.transactionId),
      body: JSON.stringify(
        resendPayload(config, {
          to: [command.to],
          subject: command.milestone
            ? milestoneNotificationCopy({
                label: command.label,
                milestone: command.milestone,
                offsetMinutes: command.offsetMinutes,
              }).subject
            : formatMessage("email.timerReminder.subject", { label: command.label }),
          html: timerReminderEmailHtml(command),
        }),
      ),
    })

    if (!res.ok) {
      throw new Error(formatMessage("errors.resendEmailFailed", { status: res.status }))
    }
  },
  async sendEmailOtp(command: EmailOtpCommand): Promise<void> {
    const config = getResendConfig()
    if (!config) return

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: resendHeaders(config),
      body: JSON.stringify(
        resendPayload(config, {
          to: [command.to],
          subject: otpSubject(command.type),
          html: otpEmailHtml(command),
        }),
      ),
    })

    if (!res.ok) {
      throw new Error(formatMessage("errors.resendOtpEmailFailed", { status: res.status }))
    }
  },
  async sendWebhookEndpointDisabledEmail(command: WebhookEndpointDisabledEmailCommand): Promise<void> {
    const config = getResendConfig()
    if (!config) return

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: resendHeaders(config, `webhook-disabled:${command.endpointId}:${command.failureCount}`),
      body: JSON.stringify(
        resendPayload(config, {
          to: [command.to],
          subject: formatMessage("email.webhookDisabled.subject", { name: command.endpointName }),
          html: webhookDisabledEmailHtml(command),
        }),
      ),
    })

    if (!res.ok) {
      throw new Error(formatMessage("errors.resendWebhookEmailFailed", { status: res.status }))
    }
  },
}

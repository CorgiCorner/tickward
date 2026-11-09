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

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/**
 * The shared frame for every email: the app icon and name, one white card and a small footer.
 * Table layout and inline styles, because mail clients drop stylesheets and flexbox.
 */
function emailLayout(input: { title: string; preheader: string; content: string; footer?: string }) {
  const origin = escapeHtml(getSiteOrigin())
  const footer = input.footer
    ? `<tr><td style="padding:16px 8px 0;font:12px/1.5 ${FONT};color:#71717a;">${input.footer}</td></tr>`
    : ""
  return [
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${input.title}</title></head>`,
    `<body style="margin:0;padding:0;background:#f4f4f5;">`,
    `<div style="display:none;max-height:0;overflow:hidden;">${input.preheader}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">`,
    `<tr><td style="padding:0 8px 16px;"><a href="${origin}" style="text-decoration:none;color:#18181b;">`,
    `<img src="${origin}/icon-192.png" width="28" height="28" alt="" style="vertical-align:middle;border:0;border-radius:7px;">`,
    `<span style="vertical-align:middle;margin-left:8px;font:600 16px/1 ${FONT};color:#18181b;">tickward</span></a></td></tr>`,
    `<tr><td style="background:#ffffff;border-radius:16px;padding:28px 24px;font:15px/1.55 ${FONT};color:#3f3f46;">${input.content}</td></tr>`,
    footer,
    `</table></td></tr></table></body></html>`,
  ].join("")
}

function emailHeading(text: string) {
  return `<h1 style="margin:0 0 12px;font:600 20px/1.3 ${FONT};color:#18181b;">${text}</h1>`
}

function emailParagraph(html: string) {
  return `<p style="margin:0 0 12px;">${html}</p>`
}

/** "Monday, 9 November 2026 at 10:00" in the timer's own zone; the raw value if it cannot parse. */
export function formatEmailDate(iso: string, timezone: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(date)
  } catch {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }).format(date)
  }
}

function zoneName(timezone: string) {
  return timezone.split("/").at(-1)?.replaceAll("_", " ") ?? timezone
}

function timerEmailHtml(command: TimerFinishedEmailCommand) {
  const label = escapeHtml(command.label)
  const targetDate = escapeHtml(formatEmailDate(command.targetDate, command.timezone))
  const timezone = escapeHtml(zoneName(command.timezone))
  const body = formatMessage("email.timerFinished.body", { label: `<strong style="color:#18181b;">${label}</strong>` })
  const when = formatMessage("email.timerFinished.when", { targetDate, timezone })
  return emailLayout({
    title: label,
    preheader: when,
    content: emailHeading(label) + emailParagraph(body) + `<p style="margin:0;color:#71717a;">${when}</p>`,
  })
}

function timerReminderEmailHtml(command: TimerReminderEmailCommand) {
  const label = escapeHtml(command.label)
  const occurrenceAt = escapeHtml(formatEmailDate(command.occurrenceAt, command.timezone))
  const timezone = escapeHtml(zoneName(command.timezone))
  const offset = escapeHtml(formatTimerReminderOffset(command.offsetMinutes))
  const settingsUrl = escapeHtml(`${getSiteOrigin()}${localeHref(DEFAULT_LOCALE, "/settings")}#alerts`)
  const strongLabel = `<strong style="color:#18181b;">${label}</strong>`
  const body = command.milestone
    ? milestoneNotificationCopy({
        label: strongLabel,
        milestone: command.milestone,
        offsetMinutes: command.offsetMinutes,
      }).body
    : formatMessage("email.timerReminder.body", {
        label: strongLabel,
        occurrenceAt,
        offset,
        timezone,
      })
  const manage = formatMessage("email.timerReminder.manage")
  return emailLayout({
    title: escapeHtml(formatMessage("email.timerReminder.heading")),
    preheader: body.replaceAll(/<[^>]+>/g, ""),
    content: emailHeading(label) + `<p style="margin:0;">${body}</p>`,
    footer: `<a href="${settingsUrl}" style="color:#71717a;text-decoration:underline;">${manage}</a>`,
  })
}

function otpSubject(type: EmailOtpType) {
  if (type === "email-verification") return formatMessage("email.otp.subject.emailVerification")
  if (type === "forget-password") return formatMessage("email.otp.subject.forgetPassword")
  if (type === "change-email") return formatMessage("email.otp.subject.changeEmail")
  return formatMessage("email.otp.subject.signIn")
}

function otpEmailHtml(command: EmailOtpCommand) {
  const otp = escapeHtml(command.otp)
  const body = formatMessage("email.otp.body", { otp: `<strong style="color:#18181b;">${otp}</strong>` })
  const expires = formatMessage("email.otp.expires")
  const code = `<p style="margin:4px 0 16px;font:700 32px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:6px;color:#18181b;">${otp}</p>`
  return emailLayout({
    title: escapeHtml(otpSubject(command.type)),
    preheader: body.replaceAll(/<[^>]+>/g, ""),
    content: emailParagraph(body) + code + `<p style="margin:0;color:#71717a;">${expires}</p>`,
  })
}

function webhookDisabledEmailHtml(command: WebhookEndpointDisabledEmailCommand) {
  const body = formatMessage("email.webhookDisabled.body", {
    count: command.failureCount,
    name: `<strong style="color:#18181b;">${escapeHtml(command.endpointName)}</strong>`,
    url: escapeHtml(command.endpointUrl),
  })
  const action = formatMessage("email.webhookDisabled.action")
  return emailLayout({
    title: escapeHtml(formatMessage("email.webhookDisabled.subject", { name: command.endpointName })),
    preheader: action,
    content: emailParagraph(body) + `<p style="margin:0;">${action}</p>`,
  })
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

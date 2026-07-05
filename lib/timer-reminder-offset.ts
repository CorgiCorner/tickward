import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"

// Dynamic plural keys: reminder.offset.week.one / reminder.offset.week.few /
// reminder.offset.week.many, reminder.offset.day.one / reminder.offset.day.few /
// reminder.offset.day.many, reminder.offset.hour.one / reminder.offset.hour.few /
// reminder.offset.hour.many, reminder.offset.minute.one /
// reminder.offset.minute.few / reminder.offset.minute.many.
export function formatTimerReminderOffset(offsetMinutes: number) {
  if (offsetMinutes === 0) return formatMessage("reminder.offset.now")
  if (offsetMinutes % 10080 === 0) return formatPluralMessage("reminder.offset.week", offsetMinutes / 10080)
  if (offsetMinutes % 1440 === 0) return formatPluralMessage("reminder.offset.day", offsetMinutes / 1440)
  if (offsetMinutes % 60 === 0) return formatPluralMessage("reminder.offset.hour", offsetMinutes / 60)
  return formatPluralMessage("reminder.offset.minute", offsetMinutes)
}

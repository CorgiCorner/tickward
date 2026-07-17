import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import type { MilestoneOccurrence } from "@/lib/milestones"

export function milestoneNotificationCopy(args: {
  label: string
  milestone: Pick<MilestoneOccurrence, "count" | "unit">
  offsetMinutes: number
}) {
  // references: milestone.unit.days.one / milestone.unit.days.few / milestone.unit.days.many
  // references: milestone.unit.weeks.one / milestone.unit.weeks.few / milestone.unit.weeks.many
  // references: milestone.unit.months.one / milestone.unit.months.few / milestone.unit.months.many
  // references: milestone.unit.years.one / milestone.unit.years.few / milestone.unit.years.many
  const unit = formatPluralMessage(`milestone.unit.${args.milestone.unit}`, args.milestone.count)
  const params = { count: args.milestone.count, label: args.label, unit }
  if (args.offsetMinutes === 0) {
    return {
      subject: formatMessage("notification.milestone.subject", params),
      body: formatMessage("notification.milestone.body", params),
    }
  }
  return {
    subject: formatMessage("notification.milestone.reminder.subject", params),
    body: formatMessage("notification.milestone.reminder.body", params),
  }
}

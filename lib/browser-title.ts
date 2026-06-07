import { formatMessage } from "@/lib/i18n/messages"
import type { Timer } from "@/lib/types"
import { effectiveTargetDate } from "@/lib/utils"

function compactDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function compactLabel(label: string) {
  const trimmed = label.trim()
  return trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed
}

function nextTimer(timers: Timer[], nowMs: number) {
  return timers
    .filter((timer) => !timer.archivedAt)
    .map((timer) => ({
      timer,
      targetMs: new Date(effectiveTargetDate(timer, nowMs)).getTime(),
    }))
    .filter(({ targetMs }) => targetMs >= nowMs)
    .sort((a, b) => a.targetMs - b.targetMs)[0]
}

export function browserTitle(args: { projectName?: string; timers: Timer[]; nowMs: number }) {
  const next = nextTimer(args.timers, args.nowMs)
  if (next) {
    const label = compactLabel(next.timer.label)
    if (Math.floor(args.nowMs / 3000) % 2 === 0) {
      return formatMessage("app.browserTitle.timerCountdown", {
        label,
        time: compactDuration(next.targetMs - args.nowMs),
      })
    }

    return formatMessage("app.browserTitle.timerEnds", { label })
  }

  if (args.projectName) return formatMessage("app.browserTitle.project", { project: args.projectName })
  return formatMessage("app.browserTitle.default")
}

"use client"

import { BellIcon } from "lucide-react"

import { useInbox, type InboxItem } from "@/components/use-inbox"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getActiveLocale } from "@/lib/i18n/active-locale"
import { formatMessage } from "@/lib/i18n/messages"
import { runInBackground } from "@/lib/background-task"
import { formatTimerReminderOffset } from "@/lib/timer-reminder-offset"
import { cn } from "@/lib/utils"

function payloadRecord(item: InboxItem) {
  return item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
    ? (item.payload as Record<string, unknown>)
    : {}
}

function itemLabel(item: InboxItem) {
  const payload = payloadRecord(item)
  return typeof payload.label === "string" && payload.label.trim() ? payload.label : item.type
}

function itemOffset(item: InboxItem) {
  const offset = payloadRecord(item).offsetMinutes
  return typeof offset === "number" && Number.isSafeInteger(offset) ? formatTimerReminderOffset(offset) : null
}

function relativeCreatedAt(value: string) {
  const createdAt = new Date(value).getTime()
  if (Number.isNaN(createdAt)) return ""

  const diffSeconds = Math.round((createdAt - Date.now()) / 1000)
  const absSeconds = Math.abs(diffSeconds)
  let unit: Intl.RelativeTimeFormatUnit = "second"
  let amount = diffSeconds
  if (absSeconds >= 86_400) {
    unit = "day"
    amount = Math.round(diffSeconds / 86_400)
  } else if (absSeconds >= 3_600) {
    unit = "hour"
    amount = Math.round(diffSeconds / 3_600)
  } else if (absSeconds >= 60) {
    unit = "minute"
    amount = Math.round(diffSeconds / 60)
  }

  return new Intl.RelativeTimeFormat(getActiveLocale(), { numeric: "auto" }).format(amount, unit)
}

function unreadBadgeLabel(count: number) {
  if (count <= 0) return formatMessage("notifications.inbox.title")
  return formatMessage("notifications.inbox.unreadLabel", { count })
}

export function NotificationBell() {
  const inbox = useInbox()
  if (!inbox.signedIn) return null

  const badge = inbox.unreadCount > 9 ? "9+" : String(inbox.unreadCount)

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={unreadBadgeLabel(inbox.unreadCount)}
              className="relative size-8 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <BellIcon className="size-4" />
              {inbox.unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
                  {badge}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          {formatMessage("notifications.inbox.title")}
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-80 p-0">
        <PopoverHeader className="border-b p-3">
          <div className="flex items-center justify-between gap-3">
            <PopoverTitle>{formatMessage("notifications.inbox.title")}</PopoverTitle>
            {inbox.unreadCount > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                onClick={() => runInBackground("inbox.markAllRead", inbox.markAllRead())}
              >
                {formatMessage("notifications.inbox.markAllRead")}
              </button>
            ) : null}
          </div>
        </PopoverHeader>

        <div className="max-h-80 overflow-y-auto p-1">
          {inbox.items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {formatMessage("notifications.inbox.empty")}
            </div>
          ) : (
            inbox.items.map((item) => {
              const unread = item.read_at === null
              const offset = itemOffset(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    unread && "bg-primary/[0.025]",
                  )}
                  onClick={() => runInBackground("inbox.markRead", inbox.markRead([item.id]))}
                >
                  <span
                    aria-hidden
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{itemLabel(item)}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[offset, relativeCreatedAt(item.created_at)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

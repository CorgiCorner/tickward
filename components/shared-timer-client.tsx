"use client"

import { CopyIcon, PlusIcon } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

import { CountdownDisplay } from "@/components/countdown-display"
import { Button } from "@/components/ui/button"
import { useNow } from "@/components/use-now"
import { formatMessage } from "@/lib/i18n/messages"
import type { ResolvedShare } from "@/lib/share-model"
import { formatTargetInTimeZone } from "@/lib/utils"
import { useTimerStore } from "@/lib/store"

type ResolvedShareClient = ResolvedShare

export function SharedTimerClient(props: Readonly<{ initial: ResolvedShareClient; shareId: string }>) {
  const nowMs = useNow(1000)

  const followTimer = useTimerStore((s) => s.followTimer)

  const timer = props.initial.timer
  const subtitle = useMemo(() => {
    return `${formatTargetInTimeZone(timer.targetDate, timer.timezone)} · ${timer.timezone}`
  }, [timer.targetDate, timer.timezone])

  return (
    <div className="rounded-3xl border bg-card p-6">
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold">{timer.label}</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="truncate text-sm text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      <div className="mt-6">
        <CountdownDisplay targetDateIsoUtc={timer.targetDate} nowMs={nowMs} />
      </div>

      <div className="mt-6 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            void navigator.clipboard.writeText(globalThis.location.href)
            toast.success(formatMessage("share.linkCopied"))
          }}
        >
          <CopyIcon className="mr-1.5 size-4" />
          {formatMessage("share.copyLinkAction")}
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            const saved = followTimer({
              shareId: props.shareId,
              timer: {
                label: timer.label,
                targetDate: timer.targetDate,
                timezone: timer.timezone,
                color: timer.color,
              },
            })
            if (!saved) {
              toast.error(formatMessage("share.timerSaveLimit"))
              return
            }
            toast.success(formatMessage("timer.saved"))
          }}
        >
          <PlusIcon className="mr-1.5 size-4" />
          {formatMessage("share.saveToMyTimers")}
        </Button>
      </div>
    </div>
  )
}

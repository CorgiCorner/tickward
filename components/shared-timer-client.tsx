"use client"

import { CodeIcon, CopyIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { CountdownDisplay } from "@/components/countdown-display"
import { EmbedSnippetControls } from "@/components/embed-snippet"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useNow } from "@/components/use-now"
import { formatMessage } from "@/lib/i18n/messages"
import type { ResolvedShare } from "@/lib/share-model"
import { formatTargetInTimeZone } from "@/lib/utils"
import { useTimerStore } from "@/lib/store"

type ResolvedShareClient = ResolvedShare

export function SharedTimerClient(props: Readonly<{ initial: ResolvedShareClient; shareId: string }>) {
  const nowMs = useNow()
  const [embedOpen, setEmbedOpen] = useState(false)

  const followTimer = useTimerStore((s) => s.followTimer)

  const timer = props.initial.timer
  const subtitle = useMemo(() => {
    return [formatTargetInTimeZone(timer.targetDate, timer.timezone), timer.timezone].filter(Boolean).join(" · ")
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

      <div className="mt-6 flex flex-wrap gap-2">
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
        <Button variant="outline" className="flex-1" onClick={() => setEmbedOpen(true)}>
          <CodeIcon className="mr-1.5 size-4" />
          {formatMessage("share.embed.tab")}
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

      <Dialog open={embedOpen} onOpenChange={setEmbedOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{formatMessage("share.embed.tab")}</DialogTitle>
            <DialogDescription>{formatMessage("share.embed.description")}</DialogDescription>
          </DialogHeader>
          <EmbedSnippetControls
            origin={typeof location === "undefined" ? "" : location.origin}
            shareId={props.shareId}
            timerLabel={timer.label}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

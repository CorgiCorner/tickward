"use client"

import { ArrowRightIcon, CodeIcon, CopyIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { CountdownDisplay } from "@/components/countdown-display"
import { EmbedSnippetControls } from "@/components/embed-snippet"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useNow } from "@/components/use-now"
import { formatMessage, localeHref } from "@/lib/i18n/messages"
import type { ResolvedShare } from "@/lib/share-model"
import { formatTargetInTimeZone } from "@/lib/utils"
import { useTimerStore } from "@/lib/store"

type ResolvedShareClient = ResolvedShare

export function SharedTimerClient(props: Readonly<{ initial: ResolvedShareClient; shareId: string }>) {
  const nowMs = useNow()
  const locale = useLocale()
  const [embedOpen, setEmbedOpen] = useState(false)

  const followTimer = useTimerStore((s) => s.followTimer)

  const timer = props.initial.timer
  const subtitle = useMemo(() => {
    return [formatTargetInTimeZone(timer.targetDate, timer.timezone), timer.timezone].filter(Boolean).join(" · ")
  }, [timer.targetDate, timer.timezone])

  function saveToMyTimers() {
    const saved = followTimer({
      shareId: props.shareId,
      timer: {
        label: timer.label,
        targetDate: timer.targetDate,
        timezone: timer.timezone,
        color: timer.color,
        mode: timer.mode,
        milestones: timer.milestones,
      },
    })
    if (!saved) {
      toast.error(formatMessage("share.timerSaveLimit"))
      return
    }
    toast.success(formatMessage("timer.saved"))
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border bg-card p-5 sm:p-6">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{timer.label}</h1>
          <div className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</div>
        </div>

        <div className="mt-6">
          <CountdownDisplay targetDateIsoUtc={timer.targetDate} nowMs={nowMs} timer={timer} />
        </div>

        <div data-slot="shared-timer-actions" className="mt-6 grid grid-cols-2 gap-2">
          <Button className="col-span-2" onClick={saveToMyTimers}>
            <PlusIcon className="size-4" />
            {formatMessage("share.saveToMyTimers")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(globalThis.location.href)
              toast.success(formatMessage("share.linkCopied"))
            }}
          >
            <CopyIcon className="size-4" />
            {formatMessage("share.copyLinkAction")}
          </Button>
          <Button variant="outline" onClick={() => setEmbedOpen(true)}>
            <CodeIcon className="size-4" />
            {formatMessage("share.embed.tab")}
          </Button>
        </div>
      </section>

      <section data-slot="shared-timer-invite" className="grid gap-2.5 rounded-3xl bg-muted p-5">
        <h2 className="text-[15px] font-semibold">{formatMessage("share.invite.title")}</h2>
        <p className="text-sm text-muted-foreground">{formatMessage("share.invite.description")}</p>
        <Button variant="outline" className="mt-1 justify-self-start" asChild>
          <Link href={localeHref(locale, "/")}>
            {formatMessage("share.invite.action")}
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
      </section>

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

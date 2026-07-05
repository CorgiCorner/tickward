"use client"

import { useState } from "react"

import { EmbedSnippetControls, parseShareUrl } from "@/components/embed-snippet"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

export function TimerShareDialog(
  props: Readonly<{
    open: boolean
    onOpenChange: (open: boolean) => void
    shareUrl: string
    shareLoading: boolean
    hasSharedMarker: boolean
    timerLabel: string
    onCreateAndCopy: () => void
  }>,
) {
  const [tab, setTab] = useState<"link" | "embed">("link")
  let actionLabel = formatMessage("share.createLink")
  if (props.shareUrl) actionLabel = formatMessage("share.copyLinkAction")
  else if (props.hasSharedMarker) actionLabel = formatMessage("share.restoreLink")

  const parsed = props.shareUrl ? parseShareUrl(props.shareUrl) : null
  const showTabs = Boolean(parsed)
  const activeTab = showTabs ? tab : "link"

  function handleOpenChange(open: boolean) {
    if (open) setTab("link")
    props.onOpenChange(open)
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(activeTab === "embed" && "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{formatMessage("share.timerDialog.title")}</DialogTitle>
          <DialogDescription>
            {formatMessage(activeTab === "embed" ? "share.embed.description" : "share.timerDialog.description")}
          </DialogDescription>
        </DialogHeader>

        {showTabs && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["link", "embed"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={activeTab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {formatMessage(value === "link" ? "share.timerDialog.linkTab" : "share.embed.tab")}
              </button>
            ))}
          </div>
        )}

        {activeTab === "embed" && parsed ? (
          <EmbedSnippetControls origin={parsed.origin} shareId={parsed.shareId} timerLabel={props.timerLabel} />
        ) : (
          <>
            <div className="grid gap-3">
              {props.shareUrl ? (
                <Input value={props.shareUrl} readOnly aria-label={formatMessage("share.timerDialog.linkInputLabel")} />
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" loading={props.shareLoading} onClick={props.onCreateAndCopy}>
                {actionLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

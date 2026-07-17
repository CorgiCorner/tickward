"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useNow } from "@/components/use-now"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatMessage } from "@/lib/i18n/messages"
import { formatElapsedSince } from "@/lib/milestone-display"
import { MILESTONE_PRESETS, milestonePresetRules, type MilestonePresetId } from "@/lib/milestone-presets"
import { newPublicId } from "@/lib/public-ids"
import { useTimerStore } from "@/lib/store"
import type { Timer } from "@/lib/types"
import { formatTargetInTimeZone } from "@/lib/utils"

export function StartCountUpFromDate(props: Readonly<{ timer: Timer; onComplete?: () => void }>) {
  const nowMs = useNow()
  const addTimer = useTimerStore((store) => store.addTimer)
  const archiveTimer = useTimerStore((store) => store.archiveTimer)
  const removeTimer = useTimerStore((store) => store.removeTimer)
  const unarchiveTimer = useTimerStore((store) => store.unarchiveTimer)
  const [open, setOpen] = useState(false)
  const [presetId, setPresetId] = useState<MilestonePresetId>("anniversaries")
  const [archiveOriginal, setArchiveOriginal] = useState(true)

  const anchorMs = Date.parse(props.timer.targetDate)
  if (props.timer.mode === "since" || !Number.isFinite(anchorMs) || anchorMs >= nowMs) return null

  const formattedAnchor = formatTargetInTimeZone(props.timer.targetDate, props.timer.timezone) ?? props.timer.targetDate
  const elapsed =
    formatElapsedSince(props.timer.targetDate, nowMs) ?? formatMessage("timer.form.startSince.elapsedFallback")

  function handleConfirm() {
    const newTimerId = newPublicId("timer")
    const created = addTimer({
      id: newTimerId,
      label: props.timer.label,
      targetDate: props.timer.targetDate,
      timezone: props.timer.timezone,
      color: props.timer.color,
      spaceId: props.timer.spaceId,
      mode: "since",
      milestones: { rules: milestonePresetRules(presetId) },
      reminders: [{ offsetMinutes: 0 }],
      notify: false,
    })
    if (!created) {
      toast.error(formatMessage("entry.limitReachedToast"))
      return
    }

    if (archiveOriginal) archiveTimer(props.timer.id)
    setOpen(false)
    props.onComplete?.()
    toast(formatMessage("timer.form.startSince.success", { date: formattedAnchor }), {
      action: {
        label: formatMessage("common.undo"),
        onClick: () => {
          removeTimer(newTimerId)
          if (archiveOriginal) unarchiveTimer(props.timer.id)
        },
      },
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setOpen(true)}>
        {formatMessage("timer.form.startSince.action")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent sheetOnMobile>
          <DialogHeader>
            <DialogTitle>{formatMessage("timer.form.startSince.title")}</DialogTitle>
            <DialogDescription>
              {formatMessage("timer.form.startSince.anchor", { date: formattedAnchor, elapsed })}
            </DialogDescription>
          </DialogHeader>

          <section className="grid gap-3">
            <div>
              <h3 className="text-sm font-medium">{formatMessage("timer.form.startSince.createdHeading")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatMessage("timer.form.startSince.createdDescription")}
              </p>
            </div>
            <div className="grid gap-2">
              <div className="text-xs font-medium">{formatMessage("timer.form.startSince.presetLabel")}</div>
              <div className="flex flex-wrap gap-2">
                {MILESTONE_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={presetId === preset.id ? "default" : "outline"}
                    size="sm"
                    aria-pressed={presetId === preset.id}
                    onClick={() => setPresetId(preset.id)}
                  >
                    {formatMessage(preset.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{formatMessage("timer.form.startSince.reminderNote")}</p>
          </section>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{formatMessage("timer.form.startSince.originalHeading")}</legend>
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <input
                type="radio"
                name="start-count-up-original"
                aria-label={formatMessage("timer.form.startSince.archive")}
                checked={archiveOriginal}
                onChange={() => setArchiveOriginal(true)}
              />
              <span>
                <span className="font-medium">{formatMessage("timer.form.startSince.archive")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {formatMessage("timer.form.startSince.archiveDescription")}
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <input
                type="radio"
                name="start-count-up-original"
                aria-label={formatMessage("timer.form.startSince.keepBoth")}
                checked={!archiveOriginal}
                onChange={() => setArchiveOriginal(false)}
              />
              <span className="font-medium">{formatMessage("timer.form.startSince.keepBoth")}</span>
            </label>
          </fieldset>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {formatMessage("common.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirm}>
              {formatMessage("timer.form.startSince.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

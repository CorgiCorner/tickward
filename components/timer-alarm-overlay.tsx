"use client"

import { XIcon } from "lucide-react"

import type { LocalTimerAlarm } from "@/components/use-local-timer-alarms"
import { Button } from "@/components/ui/button"
import { formatMessage } from "@/lib/i18n/messages"

export function TimerAlarmOverlay(
  props: Readonly<{ alarm: LocalTimerAlarm | null; onDismiss: () => void; onView?: () => void }>,
) {
  if (!props.alarm?.fullPageAlarm) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-background/95 px-6 text-center backdrop-blur"
    >
      <div className="grid max-w-sm gap-5">
        <div>
          <div className="text-sm font-medium text-muted-foreground">{formatMessage("timer.finished")}</div>
          <div className="mt-2 text-3xl font-semibold">{props.alarm.label}</div>
        </div>
        <div className="flex justify-center gap-2">
          {props.onView ? <Button onClick={props.onView}>{formatMessage("countUp.view")}</Button> : null}
          <Button onClick={props.onDismiss} variant="outline">
            <XIcon className="mr-1.5 size-4" />
            {formatMessage("common.dismiss")}
          </Button>
        </div>
      </div>
    </div>
  )
}

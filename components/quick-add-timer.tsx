"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { formatInTimeZone } from "date-fns-tz"
import { PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { TimePicker } from "@/components/ui/time-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDefaultTimeZone } from "@/lib/default-timezone.client"
import { canCreateTimer, getEntitlements, timerLimitMessage, timerSpaceLimitMessage } from "@/lib/entitlements"
import { formatMessage } from "@/lib/i18n/messages"
import { quickAddTimerFormSchema, type QuickAddTimerFormValues } from "@/lib/schemas/timer"
import { useTimerStore } from "@/lib/store"
import { timerLimitWarningMessage } from "@/lib/timer-limits"
import { activeTimerCountForTargetSpace, timerTargetSpaceId } from "@/lib/timer-space-limits"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { wallClockToUtcIso } from "@/lib/utils"

type QuickAddTimerDateTimeValues = Pick<QuickAddTimerFormValues, "date" | "time">
const quickAddTimerDateTimeSchema = quickAddTimerFormSchema.pick({ date: true, time: true })

function getDefaults(timezone: string) {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000)
  return {
    date: formatInTimeZone(nextHour, timezone, "yyyy-MM-dd"),
    time: formatInTimeZone(nextHour, timezone, "HH':00'"),
  }
}

function timerCreationLimitMessage(args: {
  entitlements: ReturnType<typeof getEntitlements>
  spaceAtLimit: boolean
  totalAtLimit: boolean
}) {
  if (args.totalAtLimit) return timerLimitMessage(args.entitlements)
  if (args.spaceAtLimit) return timerSpaceLimitMessage(args.entitlements)
  return timerLimitMessage(args.entitlements)
}

type QuickAddTimerProps = {
  label?: string
  onLabelChange?: (label: string) => void
}

export function QuickAddTimer(props: Readonly<QuickAddTimerProps>) {
  const addTimer = useTimerStore((s) => s.addTimer)
  const timers = useTimerStore((s) => s.timers)
  const activeSpaceId = useTimerStore((s) => s.activeSpaceId)
  const entitlements = getEntitlements()
  const targetSpaceId = timerTargetSpaceId(activeSpaceId)
  const defaultTimeZone = useDefaultTimeZone()
  const totalAtLimit = !canCreateTimer(timers.length, entitlements)
  const spaceAtLimit = activeTimerCountForTargetSpace(timers, targetSpaceId) >= entitlements.maxTimersPerSpace
  const atLimit = totalAtLimit || spaceAtLimit
  const limitMessage = timerCreationLimitMessage({ entitlements, spaceAtLimit, totalAtLimit })
  const [internalLabel, setInternalLabel] = useState("")
  const label = props.label ?? internalLabel
  const setLabel = props.onLabelChange ?? setInternalLabel

  const defaults = useMemo(() => getDefaults(defaultTimeZone), [defaultTimeZone])
  const form = useForm<QuickAddTimerDateTimeValues>({
    resolver: zodResolver(quickAddTimerDateTimeSchema),
    defaultValues: {
      date: defaults.date,
      time: defaults.time,
    },
    mode: "onChange",
  })
  const date = useWatch({ control: form.control, name: "date" }) ?? ""
  const time = useWatch({ control: form.control, name: "time" }) ?? ""
  const parsedForm = quickAddTimerFormSchema.safeParse({ label, date, time })

  function handleSubmit(values: QuickAddTimerDateTimeValues) {
    const parsed = quickAddTimerFormSchema.safeParse({ label, date: values.date, time: values.time })
    if (!parsed.success) return
    const parsedValues = parsed.data
    const targetDate = wallClockToUtcIso({ date: values.date, time: values.time, timezone: defaultTimeZone })

    const added = addTimer({
      label: parsedValues.label,
      targetDate,
      timezone: defaultTimeZone,
      spaceId: activeSpaceId && activeSpaceId !== UNASSIGNED_SPACE_ID ? activeSpaceId : undefined,
    })

    if (!added) {
      toast.error(limitMessage)
      return
    }

    toast.success(formatMessage("timer.created"))
    const warning = timerLimitWarningMessage(timers.length + 1, entitlements.maxTimers)
    if (warning) toast(warning, { id: "timer-limit-warn" })

    const fresh = getDefaults(defaultTimeZone)
    setLabel("")
    form.reset({
      date: fresh.date,
      time: fresh.time,
    })
  }

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="mb-4 grid min-w-0 grid-cols-1 gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_minmax(8.5rem,10rem)_minmax(6.5rem,7rem)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <Input
          placeholder={formatMessage("quickAdd.placeholder")}
          maxLength={60}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      {/* Date and time share one row on mobile; `sm:contents` lets them fall back
          into their own grid columns on wider screens. */}
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:contents">
        <div className="min-w-0">
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />}
          />
        </div>
        <div className="min-w-0">
          <Controller
            control={form.control}
            name="time"
            render={({ field }) => <TimePicker value={field.value} onChange={field.onChange} />}
          />
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="submit"
              size="icon"
              disabled={atLimit || !parsedForm.success}
              aria-label={formatMessage("common.add")}
              className="size-9 shrink-0 sm:size-8"
            >
              <PlusIcon className="size-4" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} className="max-w-[240px] text-center">
          {atLimit ? limitMessage : formatMessage("common.add")}
        </TooltipContent>
      </Tooltip>
    </form>
  )
}

"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { addDays, addMonths, format, parseISO, startOfMonth, startOfWeek } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CornerDownLeftIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TimezoneSelect } from "@/components/timezone-select"
import { useDefaultTimeZone } from "@/lib/default-timezone.client"
import { canCreateTimer, getEntitlements, timerLimitMessage, timerSpaceLimitMessage } from "@/lib/entitlements"
import { getActiveLocale } from "@/lib/i18n/active-locale"
import { formatMessage } from "@/lib/i18n/messages"
import { quickAddTimerFormSchema, type QuickAddTimerFormValues } from "@/lib/schemas/timer"
import { useTimerStore } from "@/lib/store"
import { timerLimitWarningMessage } from "@/lib/timer-limits"
import { activeTimerCountForTargetSpace, timerTargetSpaceId } from "@/lib/timer-space-limits"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { cn, wallClockToUtcIso } from "@/lib/utils"

type QuickAddTimerScheduleValues = Pick<QuickAddTimerFormValues, "date" | "time" | "timezone">
const quickAddTimerScheduleSchema = quickAddTimerFormSchema.pick({ date: true, time: true, timezone: true })

function getDefaults(timezone: string) {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000)
  return {
    date: formatInTimeZone(nextHour, timezone, "yyyy-MM-dd"),
    time: formatInTimeZone(nextHour, timezone, "HH':00'"),
    timezone,
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

function parsedDateValue(value: string) {
  try {
    const parsed = parseISO(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  } catch {
    return undefined
  }
}

function displayDateLabel(value: string) {
  const parsed = parsedDateValue(value)
  if (!parsed) return formatMessage("date.pick")
  return new Intl.DateTimeFormat(getActiveLocale(), { day: "numeric", month: "short" }).format(parsed)
}

function daysForMonth(month: Date) {
  const firstDay = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  return Array.from({ length: 42 }, (_, index) => addDays(firstDay, index))
}

function clampTimePart(value: number, max: number) {
  if (!Number.isFinite(value)) return "00"
  return String(Math.max(0, Math.min(max, value))).padStart(2, "0")
}

function updateTimePart(value: string, part: "hours" | "minutes", rawValue: string) {
  const [hours = "00", minutes = "00"] = value.split(":")
  const digits = rawValue.replace(/\D/g, "").slice(-2)
  const parsed = digits === "" ? 0 : Number(digits)
  const nextPart = clampTimePart(parsed, part === "hours" ? 23 : 59)
  return part === "hours"
    ? `${nextPart}:${minutes.padStart(2, "0").slice(0, 2)}`
    : `${hours.padStart(2, "0").slice(0, 2)}:${nextPart}`
}

function stepTimePart(value: string, part: "hours" | "minutes", step: number) {
  const [hours = "00", minutes = "00"] = value.split(":")
  const current = Number(part === "hours" ? hours : minutes)
  const max = part === "hours" ? 23 : 59
  const next = (Number.isFinite(current) ? current : 0) + step
  const wrapped = next < 0 ? max : next > max ? 0 : next
  const nextPart = String(wrapped).padStart(2, "0")
  return part === "hours"
    ? `${nextPart}:${minutes.padStart(2, "0").slice(0, 2)}`
    : `${hours.padStart(2, "0").slice(0, 2)}:${nextPart}`
}

function QuickAddCalendar(props: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const selectedDate = parsedDateValue(props.value)
  const selectedTimestamp = selectedDate?.getTime()
  const selectedMonth = startOfMonth(selectedDate ?? new Date())
  const [monthState, setMonthState] = useState(() => ({ selectedTimestamp, visibleMonth: selectedMonth }))
  const visibleMonth = monthState.selectedTimestamp === selectedTimestamp ? monthState.visibleMonth : selectedMonth

  const locale = getActiveLocale()
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(visibleMonth)
  const weekdayLabels = [
    formatMessage("quickAdd.weekday.monday"),
    formatMessage("quickAdd.weekday.tuesday"),
    formatMessage("quickAdd.weekday.wednesday"),
    formatMessage("quickAdd.weekday.thursday"),
    formatMessage("quickAdd.weekday.friday"),
    formatMessage("quickAdd.weekday.saturday"),
    formatMessage("quickAdd.weekday.sunday"),
  ]
  const days = useMemo(() => daysForMonth(visibleMonth), [visibleMonth])

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={formatMessage("quickAdd.calendar.previousMonth")}
          className="size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setMonthState({ selectedTimestamp, visibleMonth: addMonths(visibleMonth, -1) })}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <div className="text-xs font-semibold">{monthLabel}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={formatMessage("quickAdd.calendar.nextMonth")}
          className="size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setMonthState({ selectedTimestamp, visibleMonth: addMonths(visibleMonth, 1) })}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 pb-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
        {weekdayLabels.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const selected = selectedDate ? day.toDateString() === selectedDate.toDateString() : false
          return (
            <button
              key={day.toISOString()}
              type="button"
              data-day={format(day, "yyyy-MM-dd")}
              aria-pressed={selected}
              className={cn(
                "grid size-8 place-items-center rounded-md text-xs tabular-nums text-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                !selected && !isSameCalendarMonth(day, visibleMonth) && "text-muted-foreground/45",
                selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
              onClick={() => props.onChange(format(day, "yyyy-MM-dd"))}
            >
              {format(day, "d")}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function isSameCalendarMonth(day: Date, month: Date) {
  return day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear()
}

function TimePartInput(
  props: Readonly<{ label: string; part: "hours" | "minutes"; value: string; onChange: (value: string) => void }>,
) {
  const [hours = "00", minutes = "00"] = props.value.split(":")
  const value = props.part === "hours" ? hours : minutes

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={props.label}
      value={value.padStart(2, "0").slice(0, 2)}
      className="h-7 w-8 rounded-none border-0 bg-transparent px-0 text-center font-mono text-sm tabular-nums outline-none focus-visible:ring-0"
      onChange={(event) => props.onChange(updateTimePart(props.value, props.part, event.target.value))}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
        event.preventDefault()
        props.onChange(stepTimePart(props.value, props.part, event.key === "ArrowUp" ? 1 : -1))
      }}
    />
  )
}

function QuickAddTimePicker(props: Readonly<{ value: string; onChange: (value: string) => void }>) {
  return (
    <div className="inline-flex h-8 w-[6.5rem] items-center rounded-md border border-input bg-transparent px-1">
      <TimePartInput
        label={formatMessage("quickAdd.time.hours")}
        part="hours"
        value={props.value}
        onChange={props.onChange}
      />
      <span className="select-none text-xs text-muted-foreground">:</span>
      <TimePartInput
        label={formatMessage("quickAdd.time.minutes")}
        part="minutes"
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  )
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
  const form = useForm<QuickAddTimerScheduleValues>({
    resolver: zodResolver(quickAddTimerScheduleSchema),
    defaultValues: {
      date: defaults.date,
      time: defaults.time,
      timezone: defaults.timezone,
    },
    mode: "onChange",
  })
  const date = useWatch({ control: form.control, name: "date" }) ?? ""
  const time = useWatch({ control: form.control, name: "time" }) ?? ""
  const timezone = useWatch({ control: form.control, name: "timezone" }) ?? defaultTimeZone
  const parsedForm = quickAddTimerFormSchema.safeParse({ label, date, time, timezone })

  function handleSubmit(values: QuickAddTimerScheduleValues) {
    const parsed = quickAddTimerFormSchema.safeParse({
      label,
      date: values.date,
      time: values.time,
      timezone: values.timezone,
    })
    if (!parsed.success) return
    const parsedValues = parsed.data
    const targetDate = wallClockToUtcIso({ date: values.date, time: values.time, timezone: values.timezone })

    const added = addTimer({
      label: parsedValues.label,
      targetDate,
      timezone: parsedValues.timezone,
      notify: true,
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
      timezone: fresh.timezone,
    })
  }

  const chipLabel = formatMessage("quickAdd.dateChip", { date: displayDateLabel(date), time })

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="mb-5 flex min-w-0 items-center gap-1.5 rounded-[12px] border border-border bg-card py-1 pl-1.5 pr-2"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              disabled={atLimit || !parsedForm.success}
              aria-label={formatMessage("common.add")}
              className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PlusIcon className="size-4" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} className="max-w-[240px] text-center">
          {atLimit ? limitMessage : formatMessage("common.add")}
        </TooltipContent>
      </Tooltip>
      <Input
        placeholder={formatMessage("quickAdd.placeholder")}
        maxLength={60}
        value={label}
        className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2.5 text-sm shadow-none outline-none focus-visible:ring-0"
        onChange={(event) => setLabel(event.target.value)}
      />
      <kbd className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded border border-border px-1 text-muted-foreground">
        <CornerDownLeftIcon className="size-3" strokeWidth={2.5} />
      </kbd>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-8 shrink-0 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={formatMessage("timer.form.schedule")}
          >
            <CalendarIcon className="size-3.5" />
            <span className="max-w-32 truncate">{chipLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-64 rounded-lg p-3 shadow-none">
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <QuickAddCalendar value={field.value} onChange={field.onChange} />}
          />
          <div className="-mx-3 mt-3 space-y-2 border-t border-border px-3 pt-3">
            <div className="flex items-center gap-2">
              <Controller
                control={form.control}
                name="time"
                render={({ field }) => <QuickAddTimePicker value={field.value} onChange={field.onChange} />}
              />
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <div className="min-w-0 flex-1">
                    <TimezoneSelect value={field.value} onChange={field.onChange} localTz={defaultTimeZone} />
                  </div>
                )}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </form>
  )
}

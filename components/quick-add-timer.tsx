"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { addDays, addMonths, format, parseISO, startOfMonth, startOfWeek } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CornerDownLeftIcon, PlusIcon } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { Controller, useController, useForm, useWatch, type Control } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DurationPicker,
  formatDurationCompact,
  ScheduleModeToggle,
  type DurationPickerValue,
} from "@/components/ui/time-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TimezoneSelect } from "@/components/timezone-select"
import { useBrowserTimeZone, useDefaultTimeZone } from "@/lib/default-timezone.client"
import { canCreateTimer, getEntitlements, timerLimitMessage, timerSpaceLimitMessage } from "@/lib/entitlements"
import { getActiveLocale } from "@/lib/i18n/active-locale"
import { formatMessage, nextDefaultTimerLabel } from "@/lib/i18n/messages"
import {
  durationTotalSeconds,
  quickAddTimerFormSchema,
  quickAddTimerScheduleSchema,
  type QuickAddTimerFormValues,
} from "@/lib/schemas/timer"
import { useTimerStore } from "@/lib/store"
import { timerLimitWarningMessage } from "@/lib/timer-limits"
import { activeTimerCountForTargetSpace, timerTargetSpaceId } from "@/lib/timer-space-limits"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { cn, wallClockToUtcIso } from "@/lib/utils"

type QuickAddTimerScheduleValues = Omit<QuickAddTimerFormValues, "label">

function getDefaults(timezone: string): QuickAddTimerScheduleValues {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000)
  return {
    scheduleMode: "at",
    date: formatInTimeZone(nextHour, timezone, "yyyy-MM-dd"),
    time: formatInTimeZone(nextHour, timezone, "HH':00'"),
    timezone,
    durationDays: "00",
    durationHours: "00",
    durationMinutes: "10",
    durationSeconds: "00",
  }
}

function targetDateFromDuration(totalSeconds: number) {
  return new Date(Date.now() + totalSeconds * 1000).toISOString()
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
      className="h-7 w-8 rounded-none border-0 bg-transparent px-0 text-center font-mono text-base tabular-nums outline-none focus-visible:ring-0 md:text-sm"
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
    <div className="inline-flex h-9 w-[6.5rem] items-center rounded-md border border-input bg-transparent px-1">
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

function QuickAddDurationField(props: Readonly<{ control: Control<QuickAddTimerScheduleValues> }>) {
  const days = useController({ control: props.control, name: "durationDays" })
  const hours = useController({ control: props.control, name: "durationHours" })
  const minutes = useController({ control: props.control, name: "durationMinutes" })
  const seconds = useController({ control: props.control, name: "durationSeconds" })
  const value: DurationPickerValue = {
    durationDays: days.field.value,
    durationHours: hours.field.value,
    durationMinutes: minutes.field.value,
    durationSeconds: seconds.field.value,
  }

  return (
    <DurationPicker
      value={value}
      onChange={(next) => {
        days.field.onChange(next.durationDays)
        hours.field.onChange(next.durationHours)
        minutes.field.onChange(next.durationMinutes)
        seconds.field.onChange(next.durationSeconds)
      }}
    />
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
  const browserTimeZone = useBrowserTimeZone()
  const totalAtLimit = !canCreateTimer(timers.length, entitlements)
  const spaceAtLimit = activeTimerCountForTargetSpace(timers, targetSpaceId) >= entitlements.maxTimersPerSpace
  const atLimit = totalAtLimit || spaceAtLimit
  const limitMessage = timerCreationLimitMessage({ entitlements, spaceAtLimit, totalAtLimit })
  const [internalLabel, setInternalLabel] = useState("")
  const inputId = useId()
  const formId = useId()
  const label = props.label ?? internalLabel
  const setLabel = props.onLabelChange ?? setInternalLabel
  const defaultLabel = useMemo(() => nextDefaultTimerLabel(timers), [timers])
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const defaults = useMemo(() => getDefaults(defaultTimeZone), [defaultTimeZone])
  const form = useForm<QuickAddTimerScheduleValues>({
    resolver: zodResolver(quickAddTimerScheduleSchema),
    defaultValues: defaults,
    mode: "onChange",
  })
  const scheduleMode = useWatch({ control: form.control, name: "scheduleMode" }) ?? "at"
  const date = useWatch({ control: form.control, name: "date" }) ?? ""
  const time = useWatch({ control: form.control, name: "time" }) ?? ""
  const timezone = useWatch({ control: form.control, name: "timezone" }) ?? defaultTimeZone
  const durationDays = useWatch({ control: form.control, name: "durationDays" }) ?? "00"
  const durationHours = useWatch({ control: form.control, name: "durationHours" }) ?? "00"
  const durationMinutes = useWatch({ control: form.control, name: "durationMinutes" }) ?? "10"
  const durationSeconds = useWatch({ control: form.control, name: "durationSeconds" }) ?? "00"
  const durationValue: DurationPickerValue = { durationDays, durationHours, durationMinutes, durationSeconds }
  const parsedForm = quickAddTimerFormSchema.safeParse({
    label,
    scheduleMode,
    date,
    time,
    timezone,
    durationDays,
    durationHours,
    durationMinutes,
    durationSeconds,
  })
  const submitDisabled = atLimit || !parsedForm.success

  function handleSubmit(values: QuickAddTimerScheduleValues) {
    const parsed = quickAddTimerFormSchema.safeParse({
      label,
      scheduleMode: values.scheduleMode,
      date: values.date,
      time: values.time,
      timezone: values.timezone,
      durationDays: values.durationDays,
      durationHours: values.durationHours,
      durationMinutes: values.durationMinutes,
      durationSeconds: values.durationSeconds,
    })
    if (!parsed.success) return
    const parsedValues = parsed.data
    const durationMode = parsedValues.scheduleMode === "in"
    const targetDate = durationMode
      ? targetDateFromDuration(durationTotalSeconds(parsedValues))
      : wallClockToUtcIso({ date: parsedValues.date, time: parsedValues.time, timezone: parsedValues.timezone })
    const submitTimezone = durationMode ? browserTimeZone : parsedValues.timezone

    const added = addTimer({
      label: parsedValues.label || defaultLabel,
      targetDate,
      timezone: submitTimezone,
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
      scheduleMode: fresh.scheduleMode,
      durationDays: fresh.durationDays,
      durationHours: fresh.durationHours,
      durationMinutes: fresh.durationMinutes,
      durationSeconds: fresh.durationSeconds,
    })
    setScheduleOpen(false)
  }

  const chipLabel =
    scheduleMode === "in"
      ? formatMessage("quickAdd.durationChip", { duration: formatDurationCompact(durationValue) })
      : formatMessage("quickAdd.dateChip", { date: displayDateLabel(date), time })

  return (
    <form
      id={formId}
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
              disabled={submitDisabled}
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
        aria-label={formatMessage("timer.form.label")}
        placeholder={defaultLabel}
        maxLength={60}
        value={label}
        className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2.5 shadow-none outline-none focus-visible:ring-0"
        onChange={(event) => setLabel(event.target.value)}
      />
      <button
        type="submit"
        disabled={submitDisabled}
        aria-label={formatMessage("common.add")}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        <kbd
          aria-hidden="true"
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border px-1"
        >
          <CornerDownLeftIcon className="size-3" strokeWidth={2.5} />
        </kbd>
      </button>
      <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
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
        <PopoverContent align="end" sideOffset={8} className="w-80 rounded-lg p-3 shadow-none">
          <Controller
            control={form.control}
            name="scheduleMode"
            render={({ field }) => <ScheduleModeToggle compact value={field.value ?? "at"} onChange={field.onChange} />}
          />
          {scheduleMode === "in" ? (
            <div className="-mx-3 mt-3 border-t border-border px-3 pt-3">
              <QuickAddDurationField control={form.control} />
            </div>
          ) : (
            <>
              <div className="mt-3 grid gap-3 md:hidden">
                <Controller
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <div className="grid gap-2">
                      <Label htmlFor={`${inputId}-date`}>{formatMessage("timer.form.date")}</Label>
                      <Input
                        id={`${inputId}-date`}
                        type="date"
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                        className="native-date-time-input block h-9 min-h-9 w-full min-w-0 max-w-full py-0 leading-none"
                      />
                    </div>
                  )}
                />
                <Controller
                  control={form.control}
                  name="time"
                  render={({ field }) => (
                    <div className="grid gap-2">
                      <Label htmlFor={`${inputId}-time`}>{formatMessage("timer.form.time")}</Label>
                      <Input
                        id={`${inputId}-time`}
                        type="time"
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                        className="native-date-time-input block h-9 min-h-9 w-full min-w-0 max-w-full py-0 leading-none"
                      />
                    </div>
                  )}
                />
              </div>
              <div className="mt-3 hidden md:block">
                <Controller
                  control={form.control}
                  name="date"
                  render={({ field }) => <QuickAddCalendar value={field.value} onChange={field.onChange} />}
                />
              </div>
              <div className="-mx-3 mt-3 space-y-2 border-t border-border px-3 pt-3">
                <div className="grid gap-2 md:flex md:items-center">
                  <div className="hidden md:block">
                    <Controller
                      control={form.control}
                      name="time"
                      render={({ field }) => <QuickAddTimePicker value={field.value} onChange={field.onChange} />}
                    />
                  </div>
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
            </>
          )}
          <div className="-mx-3 mt-3 border-t border-border px-3 pt-3">
            <Button form={formId} type="submit" size="sm" className="w-full" disabled={submitDisabled}>
              {formatMessage("common.add")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </form>
  )
}

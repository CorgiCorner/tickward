"use client"

import { ChevronDownIcon, PlusIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useFieldArray, useWatch, type Control } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useNow } from "@/components/use-now"
import { formatMessage } from "@/lib/i18n/messages"
import { MAX_TIMER_REMINDERS, REMINDER_OFFSET_MAX_MINUTES, type TimerFormValues } from "@/lib/schemas/timer"
import { formatTimerReminderOffset } from "@/lib/timer-reminder-offset"
import type { Timer } from "@/lib/types"
import { cn, reminderOffsetsAtRisk, wallClockToUtcIso } from "@/lib/utils"

const REMINDER_PRESETS = [0, 5, 10, 30, 60, 1440, 10080] as const
const CUSTOM_UNITS = [
  {
    value: "minutes",
    multiplier: 1,
    labelKey: "timer.form.reminders.unit.minutes",
  },
  {
    value: "hours",
    multiplier: 60,
    labelKey: "timer.form.reminders.unit.hours",
  },
  {
    value: "days",
    multiplier: 1440,
    labelKey: "timer.form.reminders.unit.days",
  },
  {
    value: "weeks",
    multiplier: 10080,
    labelKey: "timer.form.reminders.unit.weeks",
  },
] as const

type CustomUnit = (typeof CUSTOM_UNITS)[number]["value"]
type InlineMessage = "customInvalid" | "duplicate" | "limit" | null

function customOffsetMinutes(amount: string, unit: CustomUnit) {
  const parsed = Number(amount)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  const multiplier = CUSTOM_UNITS.find((item) => item.value === unit)?.multiplier ?? 1
  const offsetMinutes = parsed * multiplier
  return offsetMinutes <= REMINDER_OFFSET_MAX_MINUTES ? offsetMinutes : null
}

function messageText(message: InlineMessage) {
  if (message === "duplicate") return formatMessage("timer.form.reminders.duplicate")
  if (message === "limit")
    return formatMessage("timer.form.reminders.limit", {
      max: MAX_TIMER_REMINDERS,
    })
  if (message === "customInvalid") return formatMessage("timer.form.reminders.customInvalid")
  return null
}

function scheduleTargetMs(args: { date?: string; time?: string; timezone?: string }) {
  if (!args.date || !args.time || !args.timezone) return null
  try {
    const ms = new Date(
      wallClockToUtcIso({
        date: args.date,
        time: args.time,
        timezone: args.timezone,
      }),
    ).getTime()
    return Number.isNaN(ms) ? null : ms
  } catch {
    return null
  }
}

export function TimerRemindersField(props: Readonly<{ control: Control<TimerFormValues> }>) {
  const { append, fields, remove } = useFieldArray({
    control: props.control,
    name: "reminders",
  })
  const watchedReminders = useWatch({ control: props.control, name: "reminders" })
  const reminders = useMemo(() => watchedReminders ?? [], [watchedReminders])
  const date = useWatch({ control: props.control, name: "date" })
  const time = useWatch({ control: props.control, name: "time" })
  const timezone = useWatch({ control: props.control, name: "timezone" })
  const repeatEnabled = useWatch({
    control: props.control,
    name: "repeatEnabled",
  })
  const repeatType = useWatch({ control: props.control, name: "repeatType" })
  const lastDay = useWatch({ control: props.control, name: "lastDay" })
  const timerMode = useWatch({ control: props.control, name: "timerMode" })
  const watchedMilestoneRules = useWatch({ control: props.control, name: "milestoneRules" })
  const milestoneRules = useMemo(() => watchedMilestoneRules ?? [], [watchedMilestoneRules])
  const scheduleMode = useWatch({ control: props.control, name: "scheduleMode" })
  const [customOpen, setCustomOpen] = useState(false)
  const [customAmount, setCustomAmount] = useState("15")
  const [customUnit, setCustomUnit] = useState<CustomUnit>("minutes")
  const [message, setMessage] = useState<InlineMessage>(null)
  const full = reminders.length >= MAX_TIMER_REMINDERS

  // Recurring timers roll reminders to the next occurrence, so only a fixed
  // date can put a reminder in the past.
  const now = useNow()
  const targetMs = repeatEnabled || timerMode === "since" ? null : scheduleTargetMs({ date, time, timezone })
  const isPastReminder = (offsetMinutes: number) => targetMs !== null && targetMs - offsetMinutes * 60_000 <= now
  const hasPastReminder = reminders.some((reminder) => isPastReminder(reminder.offsetMinutes))
  const atRiskOffsets = useMemo(() => {
    if (scheduleMode !== "at" || !timezone) return new Set<number>()
    const anchorMs = scheduleTargetMs({ date, time, timezone })
    if (anchorMs === null) return new Set<number>()
    const mode = timerMode ?? "until"
    const timer: Timer = {
      id: "timer-form-preview",
      label: "",
      targetDate: new Date(anchorMs).toISOString(),
      timezone,
      createdAt: new Date(now).toISOString(),
      mode,
      milestones: mode === "since" && milestoneRules.length > 0 ? { rules: milestoneRules } : undefined,
      recurrence:
        mode !== "since" && repeatEnabled
          ? { enabled: true, type: repeatType ?? "yearly", ...(lastDay ? { lastDay: true } : {}) }
          : undefined,
      reminders,
    }
    return new Set(reminderOffsetsAtRisk(timer, now))
  }, [
    date,
    lastDay,
    milestoneRules,
    now,
    reminders,
    repeatEnabled,
    repeatType,
    scheduleMode,
    time,
    timerMode,
    timezone,
  ])

  function closeCustom() {
    setCustomOpen(false)
    setCustomAmount("15")
    setCustomUnit("minutes")
    setMessage(null)
  }

  function addReminder(offsetMinutes: number | null) {
    if (offsetMinutes === null) {
      setMessage("customInvalid")
      return
    }
    if (full) {
      setMessage("limit")
      return
    }
    if (reminders.some((reminder) => reminder.offsetMinutes === offsetMinutes)) {
      setMessage("duplicate")
      return
    }
    append({ offsetMinutes }, { shouldFocus: false })
    setMessage(null)
  }

  const inlineMessage = messageText(full ? "limit" : message)

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <div className="text-sm font-medium">{formatMessage("timer.form.reminders.title")}</div>
        <p className="text-xs text-muted-foreground">{formatMessage("timer.form.reminders.description")}</p>
      </div>

      {reminders.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {reminders.map((reminder, index) => {
            const label = formatTimerReminderOffset(reminder.offsetMinutes)
            const past = isPastReminder(reminder.offsetMinutes)
            const atRisk = atRiskOffsets.has(reminder.offsetMinutes)
            return (
              <div key={fields[index]?.id ?? `${reminder.offsetMinutes}-${index}`} className="grid max-w-xs gap-1">
                <span
                  className={cn(
                    "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs",
                    past && "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
                  )}
                >
                  <span className="truncate">{label}</span>
                  <button
                    type="button"
                    className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    aria-label={formatMessage("timer.form.reminders.remove", {
                      offset: label,
                    })}
                    onClick={() => {
                      remove(index)
                      setMessage(null)
                    }}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </span>
                {atRisk ? (
                  <p className="rounded-md border border-amber-500/30 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    {formatMessage("timer.form.reminders.offsetTooLarge")}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {hasPastReminder ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {formatMessage("timer.form.reminders.pastWarning")}
        </p>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          {REMINDER_PRESETS.map((offsetMinutes) => (
            <Button
              key={offsetMinutes}
              type="button"
              variant="outline"
              size="sm"
              disabled={full}
              onClick={() => addReminder(offsetMinutes)}
            >
              <PlusIcon className="size-3.5" />
              {formatTimerReminderOffset(offsetMinutes)}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={full}
            onClick={() => (customOpen ? closeCustom() : setCustomOpen(true))}
          >
            <PlusIcon className="size-3.5" />
            {formatMessage("timer.form.reminders.custom")}
          </Button>
        </div>

        {customOpen ? (
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-custom-amount" className="text-xs">
                {formatMessage("timer.form.reminders.customAmount")}
              </Label>
              <Input
                id="reminder-custom-amount"
                type="number"
                min={0}
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-custom-unit" className="text-xs">
                {formatMessage("timer.form.reminders.customUnit")}
              </Label>
              <div className="relative">
                <select
                  id="reminder-custom-unit"
                  className="h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                  value={customUnit}
                  onChange={(event) => setCustomUnit(event.target.value as CustomUnit)}
                >
                  {CUSTOM_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {formatMessage(unit.labelKey)}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => addReminder(customOffsetMinutes(customAmount, customUnit))}>
              {formatMessage("timer.form.reminders.add")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={closeCustom}>
              {formatMessage("common.cancel")}
            </Button>
          </div>
        ) : null}

        {inlineMessage ? <p className="text-xs text-muted-foreground">{inlineMessage}</p> : null}
      </div>
    </div>
  )
}

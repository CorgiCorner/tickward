"use client"

import { PlusIcon } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { useController, useWatch, type Control } from "react-hook-form"

import { MENU_MOTION_CLASSNAME } from "@/components/dashboard/motion"
import { FadeInText, RevealRow } from "@/components/timer-form/reveal"
import { useNow } from "@/components/use-now"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { MAX_TIMER_REMINDERS, REMINDER_OFFSET_MAX_MINUTES, type TimerFormValues } from "@/lib/schemas/timer"
import { formatTimerReminderOffset } from "@/lib/timer-reminder-offset"
import type { Timer } from "@/lib/types"
import { cn, reminderOffsetsAtRisk, wallClockToUtcIso } from "@/lib/utils"

// Offsets in minutes before the date. Every value is inside the range the timer
// schema, the public API and the reminder scheduler accept (0 to 4 weeks).
export const COUNTDOWN_REMINDER_PRESETS = [10_080, 1440, 60, 10] as const
// Count-up reminders fire around each milestone; 0 is the milestone itself.
export const COUNT_UP_REMINDER_PRESETS = [0, 1440, 10_080] as const

const CUSTOM_UNITS = [
  { value: "minutes", multiplier: 1, labelKey: "timer.form.reminders.unit.minutes" },
  { value: "hours", multiplier: 60, labelKey: "timer.form.reminders.unit.hours" },
  { value: "days", multiplier: 1440, labelKey: "timer.form.reminders.unit.days" },
  { value: "weeks", multiplier: 10_080, labelKey: "timer.form.reminders.unit.weeks" },
] as const satisfies ReadonlyArray<{ value: string; multiplier: number; labelKey: MessageKey }>

type CustomUnit = (typeof CUSTOM_UNITS)[number]["value"]
type InlineMessage = "customInvalid" | "duplicate" | "limit" | null

export function customReminderOffsetMinutes(amount: string, unit: CustomUnit) {
  if (!/^\d+$/.test(amount.trim())) return null
  const parsed = Number(amount)
  const multiplier = CUSTOM_UNITS.find((item) => item.value === unit)?.multiplier ?? 1
  const offsetMinutes = parsed * multiplier
  return offsetMinutes <= REMINDER_OFFSET_MAX_MINUTES ? offsetMinutes : null
}

export function reminderChipLabel(offsetMinutes: number, timerMode: TimerFormValues["timerMode"]) {
  if (offsetMinutes === 0 && timerMode === "since") return formatMessage("timer.form.reminders.atMilestone")
  return formatTimerReminderOffset(offsetMinutes)
}

function messageText(message: InlineMessage) {
  if (message === "duplicate") return formatMessage("timer.form.reminders.duplicate")
  if (message === "limit") return formatMessage("timer.form.reminders.limit", { max: MAX_TIMER_REMINDERS })
  if (message === "customInvalid") return formatMessage("timer.form.reminders.customInvalid")
  return null
}

function scheduleTargetMs(args: { date?: string; time?: string; timezone?: string }) {
  if (!args.date || !args.time || !args.timezone) return null
  try {
    const ms = new Date(wallClockToUtcIso({ date: args.date, time: args.time, timezone: args.timezone })).getTime()
    return Number.isNaN(ms) ? null : ms
  } catch {
    return null
  }
}

// Shared by preset and custom chips: a 120 ms colour change when toggled and a
// small press response; reduced motion keeps the colour change only.
export const CHIP_CLASS =
  "inline-flex min-h-10 items-center gap-1 rounded-full md:min-h-8 border px-3 py-1 text-xs font-medium outline-none transition-[color,background-color,border-color,transform] duration-press ease-fade focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100"

export function chipStateClass(selected: boolean) {
  return selected
    ? "border-primary bg-primary text-primary-foreground"
    : "border-border text-muted-foreground hover:text-foreground"
}

function useReminderWarnings(control: Control<TimerFormValues>, reminders: Array<{ offsetMinutes: number }>) {
  const [date, time, timezone, repeatEnabled, repeatType, lastDay, timerMode, milestoneRules, scheduleMode] = useWatch({
    control,
    name: [
      "date",
      "time",
      "timezone",
      "repeatEnabled",
      "repeatType",
      "lastDay",
      "timerMode",
      "milestoneRules",
      "scheduleMode",
    ],
  })
  const now = useNow()

  // Recurring timers roll reminders to the next occurrence, so only a fixed
  // date can put a reminder in the past.
  const targetMs = repeatEnabled || timerMode === "since" ? null : scheduleTargetMs({ date, time, timezone })
  const pastOffsets = useMemo(() => {
    if (targetMs === null) return new Set<number>()
    return new Set(
      reminders
        .map((reminder) => reminder.offsetMinutes)
        .filter((offsetMinutes) => targetMs - offsetMinutes * 60_000 <= now),
    )
  }, [now, reminders, targetMs])

  const atRiskOffsets = useMemo(() => {
    if (scheduleMode !== "at" || !timezone) return new Set<number>()
    const anchorMs = scheduleTargetMs({ date, time, timezone })
    if (anchorMs === null) return new Set<number>()
    const mode = timerMode ?? "until"
    const rules = milestoneRules ?? []
    const timer: Timer = {
      id: "timer-form-preview",
      label: "",
      targetDate: new Date(anchorMs).toISOString(),
      timezone,
      createdAt: new Date(now).toISOString(),
      mode,
      milestones: mode === "since" && rules.length > 0 ? { rules } : undefined,
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

  return { pastOffsets, atRiskOffsets }
}

function CustomReminderRow(
  props: Readonly<{ onAdd: (offsetMinutes: number | null) => void; onCancel: () => void; disabled: boolean }>,
) {
  const amountId = useId()
  const unitId = useId()
  const [amount, setAmount] = useState("15")
  const [unit, setUnit] = useState<CustomUnit>("minutes")

  return (
    <RevealRow className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
      <div className="grid gap-2">
        <Label htmlFor={amountId}>{formatMessage("timer.form.reminders.customAmount")}</Label>
        <Input
          id={amountId}
          type="number"
          min={0}
          inputMode="numeric"
          value={amount}
          disabled={props.disabled}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={unitId}>{formatMessage("timer.form.reminders.customUnit")}</Label>
        <Select value={unit} onValueChange={(value) => setUnit(value as CustomUnit)} disabled={props.disabled}>
          <SelectTrigger id={unitId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={MENU_MOTION_CLASSNAME}>
            {CUSTOM_UNITS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {formatMessage(item.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onAdd(customReminderOffsetMinutes(amount, unit))}
      >
        {formatMessage("timer.form.reminders.add")}
      </Button>
      <Button type="button" variant="ghost" onClick={props.onCancel}>
        {formatMessage("common.cancel")}
      </Button>
    </RevealRow>
  )
}

/**
 * Reminder chips: presets toggle on and off, offsets already on the timer that
 * are not presets show as extra selected chips, and "Custom" adds any offset the
 * scheduler accepts. Up to five, in the order they were added.
 */
export function TimerReminderChips(
  props: Readonly<{
    control: Control<TimerFormValues>
    timerMode: TimerFormValues["timerMode"]
    disabled?: boolean
  }>,
) {
  const { field } = useController({ control: props.control, name: "reminders" })
  const reminders = useMemo(() => field.value ?? [], [field.value])
  const [customOpen, setCustomOpen] = useState(false)
  const [message, setMessage] = useState<InlineMessage>(null)
  const { pastOffsets, atRiskOffsets } = useReminderWarnings(props.control, reminders)
  const disabled = props.disabled === true
  const full = reminders.length >= MAX_TIMER_REMINDERS
  const presets: readonly number[] =
    props.timerMode === "since" ? COUNT_UP_REMINDER_PRESETS : COUNTDOWN_REMINDER_PRESETS
  const selected = new Set(reminders.map((reminder) => reminder.offsetMinutes))
  const extraOffsets = reminders
    .map((reminder) => reminder.offsetMinutes)
    .filter((offsetMinutes) => !presets.includes(offsetMinutes))
  const chips = [...presets, ...extraOffsets]

  function remove(offsetMinutes: number) {
    field.onChange(reminders.filter((reminder) => reminder.offsetMinutes !== offsetMinutes))
    setMessage(null)
  }

  function add(offsetMinutes: number | null) {
    if (offsetMinutes === null) {
      setMessage("customInvalid")
      return false
    }
    if (selected.has(offsetMinutes)) {
      setMessage("duplicate")
      return false
    }
    if (full) {
      setMessage("limit")
      return false
    }
    field.onChange([...reminders, { offsetMinutes }])
    setMessage(null)
    return true
  }

  const inlineMessage = messageText(message ?? (full && !disabled ? "limit" : null))
  const atRiskSelected = [...atRiskOffsets].some((offsetMinutes) => selected.has(offsetMinutes))

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((offsetMinutes) => {
          const on = selected.has(offsetMinutes)
          const past = on && pastOffsets.has(offsetMinutes)
          return (
            <button
              key={offsetMinutes}
              type="button"
              aria-pressed={on}
              disabled={disabled || (!on && full)}
              data-reminder-past={past ? "true" : undefined}
              className={cn(
                CHIP_CLASS,
                chipStateClass(on),
                past && "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
              )}
              onClick={() => (on ? remove(offsetMinutes) : add(offsetMinutes))}
            >
              {reminderChipLabel(offsetMinutes, props.timerMode)}
            </button>
          )
        })}
        <button
          type="button"
          aria-expanded={customOpen}
          disabled={disabled || full}
          className={cn(CHIP_CLASS, chipStateClass(false), "border-dashed")}
          onClick={() => {
            setCustomOpen((open) => !open)
            setMessage(null)
          }}
        >
          <PlusIcon aria-hidden="true" className="size-3" />
          {formatMessage("timer.form.reminders.custom")}
        </button>
      </div>

      {customOpen && !disabled ? (
        <CustomReminderRow
          disabled={full}
          onAdd={(offsetMinutes) => {
            if (add(offsetMinutes)) setCustomOpen(false)
          }}
          onCancel={() => {
            setCustomOpen(false)
            setMessage(null)
          }}
        />
      ) : null}

      {pastOffsets.size > 0 && !disabled ? (
        <FadeInText className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {formatMessage("timer.form.reminders.pastWarning")}
        </FadeInText>
      ) : null}
      {atRiskSelected && !disabled ? (
        <FadeInText className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {formatMessage("timer.form.reminders.offsetTooLarge")}
        </FadeInText>
      ) : null}
      {inlineMessage ? (
        <FadeInText key={inlineMessage} role="status" className="text-xs text-muted-foreground">
          {inlineMessage}
        </FadeInText>
      ) : null}
    </div>
  )
}

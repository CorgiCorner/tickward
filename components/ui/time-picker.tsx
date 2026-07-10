import * as React from "react"
import { format } from "date-fns"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useNow } from "@/components/use-now"
import { formatMessage, formatPluralMessage, type MessageKey } from "@/lib/i18n/messages"
import { durationTotalSeconds } from "@/lib/schemas/timer"
import { cn } from "@/lib/utils"
import { type TimePickerType, getArrowByType, getDateByType, setDateByType } from "@/lib/time-picker-utils"

export type DurationPickerValue = {
  durationDays: string
  durationHours: string
  durationMinutes: string
  durationSeconds: string
}

type DurationPart = keyof DurationPickerValue
type ScheduleMode = "at" | "in"

const DURATION_PARTS: Array<{ name: DurationPart; labelKey: MessageKey; max: number }> = [
  { name: "durationDays", labelKey: "timer.form.duration.days", max: 99 },
  { name: "durationHours", labelKey: "timer.form.duration.hours", max: 99 },
  { name: "durationMinutes", labelKey: "timer.form.duration.minutes", max: 59 },
  { name: "durationSeconds", labelKey: "timer.form.duration.seconds", max: 59 },
]

const DURATION_PRESETS: Array<{ seconds: number; labelKey: MessageKey }> = [
  { seconds: 300, labelKey: "timer.form.duration.preset.fiveMinutes" },
  { seconds: 600, labelKey: "timer.form.duration.preset.tenMinutes" },
  { seconds: 900, labelKey: "timer.form.duration.preset.fifteenMinutes" },
  { seconds: 1500, labelKey: "timer.form.duration.preset.twentyFiveMinutes" },
  { seconds: 1800, labelKey: "timer.form.duration.preset.thirtyMinutes" },
  { seconds: 2700, labelKey: "timer.form.duration.preset.fortyFiveMinutes" },
  { seconds: 3600, labelKey: "timer.form.duration.preset.oneHour" },
]

const SCHEDULE_MODES: Array<{ value: ScheduleMode; labelKey: "timer.form.mode.at" | "timer.form.mode.in" }> = [
  { value: "at", labelKey: "timer.form.mode.at" },
  { value: "in", labelKey: "timer.form.mode.in" },
]

function padDurationPart(value: number) {
  return String(Math.max(0, value)).padStart(2, "0")
}

function clampDurationPart(rawValue: string, max: number) {
  const digits = rawValue.replace(/\D/g, "").slice(-2)
  const parsed = digits === "" ? 0 : Number(digits)
  return padDurationPart(Math.min(max, parsed))
}

function stepDurationPart(value: string, max: number, step: number) {
  const current = Number.parseInt(value, 10)
  const next = (Number.isFinite(current) ? current : 0) + step
  if (next < 0) return padDurationPart(max)
  if (next > max) return "00"
  return padDurationPart(next)
}

export function valueFromTotalSeconds(totalSeconds: number): DurationPickerValue {
  const days = Math.floor(totalSeconds / 86400)
  const remainderSeconds = totalSeconds % 86400
  const hours = Math.floor(remainderSeconds / 3600)
  const minutes = Math.floor((remainderSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return {
    durationDays: padDurationPart(days),
    durationHours: padDurationPart(hours),
    durationMinutes: padDurationPart(minutes),
    durationSeconds: padDurationPart(seconds),
  }
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

export function formatDurationCompact(value: DurationPickerValue) {
  const totalSeconds = durationTotalSeconds(value)
  const days = Math.floor(totalSeconds / 86400)
  const remainderSeconds = totalSeconds % 86400
  const hours = Math.floor(remainderSeconds / 3600)
  const minutes = Math.floor((remainderSeconds % 3600) / 60)
  const seconds = remainderSeconds % 60
  const timePart =
    hours > 0
      ? `${hours}:${padDurationPart(minutes)}:${padDurationPart(seconds)}`
      : `${minutes}:${padDurationPart(seconds)}`

  if (days > 0) {
    const dayPart = formatPluralMessage("duration.compact.days", days, { days })
    return remainderSeconds === 0 ? dayPart : `${dayPart} ${timePart}`
  }

  return timePart
}

export function ScheduleModeToggle(
  props: Readonly<{
    value: ScheduleMode
    onChange: (value: ScheduleMode) => void
    compact?: boolean
  }>,
) {
  return (
    <div
      role="group"
      aria-label={formatMessage("timer.form.schedule")}
      className={cn(
        "grid grid-cols-2 rounded-full border border-border bg-muted/30 p-1",
        props.compact ? "text-xs" : "text-sm",
      )}
    >
      {SCHEDULE_MODES.map((mode) => {
        const active = props.value === mode.value
        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={active}
            className={cn(
              "min-h-9 rounded-full px-3 font-medium transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
              props.compact && "min-h-8 px-2 text-xs",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => props.onChange(mode.value)}
          >
            {formatMessage(mode.labelKey)}
          </button>
        )
      })}
    </div>
  )
}

export function DurationPicker(
  props: Readonly<{
    value: DurationPickerValue
    onChange: (value: DurationPickerValue) => void
    className?: string
  }>,
) {
  const id = React.useId()
  const nowMs = useNow()
  const totalSeconds = durationTotalSeconds(props.value)
  const now = new Date(nowMs)
  const target = new Date(nowMs + totalSeconds * 1000)
  const previewPattern = isSameCalendarDay(now, target) ? "HH:mm" : "MMM d, HH:mm"
  const preview = format(target, previewPattern)

  function updatePart(part: DurationPart, value: string) {
    props.onChange({ ...props.value, [part]: value })
  }

  return (
    <div className={cn("grid gap-3", props.className)}>
      <div className="grid grid-cols-4 gap-2">
        {DURATION_PARTS.map((part) => {
          const inputId = `${id}-${part.name}`
          return (
            <div key={part.name} className="grid min-w-0 gap-1.5">
              <Label htmlFor={inputId} className="text-xs">
                {formatMessage(part.labelKey)}
              </Label>
              <Input
                id={inputId}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={formatMessage(part.labelKey)}
                value={props.value[part.name].padStart(2, "0").slice(0, 2)}
                className="h-10 min-h-10 px-2 text-center font-mono text-base tabular-nums md:h-9 md:min-h-9"
                onChange={(event) => updatePart(part.name, clampDurationPart(event.target.value, part.max))}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
                  event.preventDefault()
                  updatePart(
                    part.name,
                    stepDurationPart(props.value[part.name], part.max, event.key === "ArrowUp" ? 1 : -1),
                  )
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {DURATION_PRESETS.map((preset) => (
          <button
            key={preset.seconds}
            type="button"
            className="min-h-10 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none md:min-h-8"
            onClick={() => props.onChange(valueFromTotalSeconds(preset.seconds))}
          >
            {formatMessage(preset.labelKey)}
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        {formatMessage("timer.form.duration.endsAt", { time: preview })}
      </div>
    </div>
  )
}

// --- low-level segment input (hours / minutes) ---

interface TimePickerInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  picker: TimePickerType
  date: Date
  setDate: (date: Date) => void
  onRightFocus?: () => void
  onLeftFocus?: () => void
}

const TimePickerInput = React.forwardRef<HTMLInputElement, TimePickerInputProps>(
  ({ className, picker, date, setDate, onLeftFocus, onRightFocus, onKeyDown, ...props }, ref) => {
    const [flag, setFlag] = React.useState(false)

    React.useEffect(() => {
      if (flag) {
        const t = setTimeout(() => setFlag(false), 2000)
        return () => clearTimeout(t)
      }
    }, [flag])

    const calculatedValue = React.useMemo(() => getDateByType(date, picker), [date, picker])

    const calculateNewValue = (key: string) => (flag ? calculatedValue.slice(1, 2) + key : "0" + key)

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") return
      e.preventDefault()
      if (e.key === "ArrowRight") onRightFocus?.()
      if (e.key === "ArrowLeft") onLeftFocus?.()
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const step = e.key === "ArrowUp" ? 1 : -1
        const newValue = getArrowByType(calculatedValue, step, picker)
        if (flag) setFlag(false)
        setDate(setDateByType(new Date(date), newValue, picker))
      }
      if (e.key >= "0" && e.key <= "9") {
        const newValue = calculateNewValue(e.key)
        if (flag) onRightFocus?.()
        setFlag((prev) => !prev)
        setDate(setDateByType(new Date(date), newValue, picker))
      }
    }

    return (
      <Input
        ref={ref}
        className={cn(
          "w-[48px] text-center font-mono text-base tabular-nums caret-transparent focus-visible:ring-0 focus-visible:border-transparent [&::-webkit-inner-spin-button]:appearance-none",
          className,
        )}
        value={calculatedValue}
        onChange={(e) => e.preventDefault()}
        type="tel"
        inputMode="decimal"
        onKeyDown={(e) => {
          onKeyDown?.(e)
          handleKeyDown(e)
        }}
        {...props}
      />
    )
  },
)
TimePickerInput.displayName = "TimePickerInput"

// --- public component ---

interface TimePickerProps {
  value: string // "HH:mm"
  onChange: (value: string) => void
}

function TimePicker({ value, onChange }: Readonly<TimePickerProps>) {
  const hourRef = React.useRef<HTMLInputElement>(null)
  const minuteRef = React.useRef<HTMLInputElement>(null)

  // parse "HH:mm" → Date for the segment inputs
  const date = React.useMemo(() => {
    const [h, m] = value.split(":").map(Number)
    const d = new Date()
    d.setHours(h || 0, m || 0, 0, 0)
    return d
  }, [value])

  function handleDateChange(d: Date) {
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    onChange(`${hh}:${mm}`)
  }

  return (
    <>
      {/* Mobile: native time input */}
      <Input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="native-date-time-input block h-9 min-h-9 w-full min-w-0 max-w-full py-0 leading-none md:hidden"
      />

      {/* Desktop: two-segment input */}
      <div className="hidden h-9 min-w-0 max-w-full items-center rounded-md border border-input px-1 shadow-xs md:inline-flex dark:bg-input/30">
        <TimePickerInput
          ref={hourRef}
          picker="hours"
          date={date}
          setDate={handleDateChange}
          onRightFocus={() => minuteRef.current?.focus()}
          className="h-7 w-8 border-0 shadow-none rounded-none rounded-l-md px-0 text-sm bg-transparent dark:bg-transparent"
        />
        <span className="text-sm text-muted-foreground select-none">:</span>
        <TimePickerInput
          ref={minuteRef}
          picker="minutes"
          date={date}
          setDate={handleDateChange}
          onLeftFocus={() => hourRef.current?.focus()}
          className="h-7 w-8 border-0 shadow-none rounded-none rounded-r-md px-0 text-sm bg-transparent dark:bg-transparent"
        />
      </div>
    </>
  )
}

export { TimePicker }

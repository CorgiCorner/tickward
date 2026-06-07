import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { type TimePickerType, getArrowByType, getDateByType, setDateByType } from "@/lib/time-picker-utils"

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

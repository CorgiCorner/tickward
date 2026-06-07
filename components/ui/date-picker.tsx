import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, parseISO } from "date-fns"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
}

function DatePicker({ value, onChange }: Readonly<DatePickerProps>) {
  const [open, setOpen] = React.useState(false)

  const selected = value ? parseISO(value) : undefined

  function handleSelect(day: Date | undefined) {
    if (day) {
      const y = day.getFullYear()
      const m = String(day.getMonth() + 1).padStart(2, "0")
      const d = String(day.getDate()).padStart(2, "0")
      onChange(`${y}-${m}-${d}`)
    }
    setOpen(false)
  }

  const displayValue = value ? format(parseISO(value), "MMM d, yyyy") : formatMessage("date.pick")

  return (
    <>
      {/* Mobile: native date input */}
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="native-date-time-input block h-9 min-h-9 w-full min-w-0 max-w-full py-0 leading-none md:hidden"
      />

      {/* Desktop: popover + calendar */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "hidden w-full min-w-0 max-w-full justify-start text-left font-normal md:inline-flex",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-1.5 size-4" />
            {displayValue}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={selected} onSelect={handleSelect} defaultMonth={selected} />
        </PopoverContent>
      </Popover>
    </>
  )
}

export { DatePicker }

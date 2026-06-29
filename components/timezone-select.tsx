import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"
import { formatTimeZoneLabel, getAllTimeZones, getPinnedTimeZones } from "@/lib/timezones"

export function TimezoneSelect(
  props: Readonly<{ disabled?: boolean; value: string; onChange: (value: string) => void; localTz: string }>,
) {
  const { disabled = false, value, onChange, localTz } = props
  const [open, setOpen] = useState(false)

  const all = useMemo(() => getAllTimeZones(), [])
  const pinned = useMemo(() => getPinnedTimeZones(localTz), [localTz])

  return (
    <Popover modal open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          aria-haspopup="listbox"
          className="w-full justify-between"
          disabled={disabled}
        >
          <span className="truncate">{formatTimeZoneLabel(value)}</span>
          <ChevronsUpDownIcon className="ml-1.5 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={formatMessage("timezone.search")} />
          <CommandList>
            <CommandEmpty>{formatMessage("timezone.noResults")}</CommandEmpty>
            <CommandGroup heading={formatMessage("timezone.pinned")}>
              {pinned.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  onSelect={() => {
                    onChange(tz)
                    setOpen(false)
                  }}
                >
                  <CheckIcon className={cn("mr-1.5 size-4", value === tz ? "opacity-100" : "opacity-0")} />
                  {formatTimeZoneLabel(tz)}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={formatMessage("timezone.all")}>
              {all.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  onSelect={() => {
                    onChange(tz)
                    setOpen(false)
                  }}
                >
                  <CheckIcon className={cn("mr-1.5 size-4", value === tz ? "opacity-100" : "opacity-0")} />
                  {formatTimeZoneLabel(tz)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

"use client"

import { Maximize2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage } from "@/lib/i18n/messages"

export function TimerFocusAction(
  props: Readonly<{
    onOpen: () => void
    className?: string
    stopPropagation?: boolean
  }>,
) {
  const label = formatMessage("timer.focus.enter")

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={props.className}
          aria-label={label}
          onClick={(event) => {
            if (props.stopPropagation) event.stopPropagation()
            props.onOpen()
          }}
        >
          <Maximize2Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

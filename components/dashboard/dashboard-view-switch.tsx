"use client"

import { LayoutGridIcon, ListIcon, LoaderIcon, type LucideIcon } from "lucide-react"
import { useRef, type KeyboardEvent } from "react"

import { readCardsDashboardView, type DashboardView } from "@/components/dashboard/dashboard-view"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

const OPTIONS: Array<{ value: DashboardView; labelKey: MessageKey; icon: LucideIcon }> = [
  { value: "grid", labelKey: "dashboard.view.grid", icon: LayoutGridIcon },
  { value: "list", labelKey: "dashboard.view.list", icon: ListIcon },
  { value: "dial", labelKey: "dashboard.view.dial", icon: LoaderIcon },
]

// Arrow keys move through the options and pick the one they land on, as in any radio group.
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"])
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"])

/**
 * Grid, list or dial: a segmented control that never wraps. Phones use `DashboardDialToggle`.
 * One tab stop (the chosen view); the arrow keys, Home and End move between the options.
 */
export function DashboardViewSwitch(
  props: Readonly<{ value: DashboardView; onChange: (view: DashboardView) => void; className?: string }>,
) {
  const buttons = useRef(new Map<DashboardView, HTMLButtonElement>())

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = OPTIONS.findIndex((option) => option.value === props.value)
    let next: number
    if (NEXT_KEYS.has(event.key)) next = (current + 1) % OPTIONS.length
    else if (PREVIOUS_KEYS.has(event.key)) next = (current - 1 + OPTIONS.length) % OPTIONS.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = OPTIONS.length - 1
    else return
    event.preventDefault()
    const view = OPTIONS[next].value
    buttons.current.get(view)?.focus()
    if (view !== props.value) props.onChange(view)
  }

  return (
    <div
      role="radiogroup"
      aria-label={formatMessage("dashboard.view.label")}
      data-slot="dashboard-view-switch"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-[12px] border border-border bg-card p-1",
        props.className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = option.value === props.value
        const Icon = option.icon
        const label = formatMessage(option.labelKey)
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                ref={(node) => {
                  if (node) buttons.current.set(option.value, node)
                  else buttons.current.delete(option.value)
                }}
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                aria-label={label}
                data-view={option.value}
                onClick={() => {
                  if (!active) props.onChange(option.value)
                }}
                className={cn(
                  "grid size-9 place-items-center rounded-md outline-none transition-[background-color,color,transform] duration-press ease-fade focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {label}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/**
 * Phones show the cards in one column for both grid and list, so there the choice is cards or
 * dial: one toggle beside sort, the same size as the organizer's other buttons.
 */
export function DashboardDialToggle(
  props: Readonly<{ value: DashboardView; onChange: (view: DashboardView) => void; className?: string }>,
) {
  const dial = props.value === "dial"
  const label = formatMessage("dashboard.view.dial")
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={label}
      aria-pressed={dial}
      title={label}
      data-slot="dashboard-dial-toggle"
      onClick={() => props.onChange(dial ? readCardsDashboardView() : "dial")}
      className={cn(
        "size-8 shrink-0 border-border shadow-none active:scale-[0.97] motion-reduce:active:scale-100",
        dial
          ? "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background"
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        props.className,
      )}
    >
      <LoaderIcon aria-hidden="true" className="size-4" />
    </Button>
  )
}

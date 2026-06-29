"use client"

import {
  ArrowDownAZIcon,
  ArrowDownWideNarrowIcon,
  ArrowUpDownIcon,
  ArrowUpNarrowWideIcon,
  BellOffIcon,
  CheckIcon,
  ClockIcon,
  GripVerticalIcon,
  LinkIcon,
  ListFilterIcon,
  PinIcon,
  PlusIcon,
  RepeatIcon,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ColorSwatches } from "@/components/spaces-manager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/components/use-now"
import { getEntitlements, spaceLimitMessage } from "@/lib/entitlements"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { activeTimerFilterCount, timerToggleFilterCount } from "@/lib/timer-filters"
import type { Space, Timer, TimerFilterKey, TimerFilterType, TimerSortMode } from "@/lib/types"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"

const SORT_OPTIONS: Array<{ value: TimerSortMode; labelKey: MessageKey; icon: LucideIcon }> = [
  { value: "manual", labelKey: "organizer.sort.label.manual", icon: GripVerticalIcon },
  { value: "soonest", labelKey: "organizer.sort.label.soonest", icon: ArrowUpNarrowWideIcon },
  { value: "latest", labelKey: "organizer.sort.label.latest", icon: ArrowDownWideNarrowIcon },
  { value: "name_asc", labelKey: "organizer.sort.label.nameAsc", icon: ArrowDownAZIcon },
  { value: "recently_added", labelKey: "organizer.sort.label.recentlyAdded", icon: ClockIcon },
]

const TYPE_OPTIONS: Array<{ value: TimerFilterType; labelKey: MessageKey }> = [
  { value: "all", labelKey: "organizer.filters.type.all" },
  { value: "countdown", labelKey: "organizer.filters.type.countdown" },
  { value: "countUp", labelKey: "organizer.filters.type.countUp" },
]

const FILTER_OPTIONS: Array<{ value: TimerFilterKey; labelKey: MessageKey; icon: LucideIcon }> = [
  { value: "pinned", labelKey: "organizer.filters.pinned", icon: PinIcon },
  { value: "muted", labelKey: "organizer.filters.muted", icon: BellOffIcon },
  { value: "shared", labelKey: "organizer.filters.shared", icon: LinkIcon },
  { value: "recurring", labelKey: "organizer.filters.recurring", icon: RepeatIcon },
]

function hasVisibleSpace(spaces: Pick<Space, "id">[], spaceId: string | undefined) {
  return Boolean(spaceId && spaces.some((space) => space.id === spaceId))
}

function timerMatchesSpace(
  timer: Pick<Timer, "archivedAt" | "spaceId">,
  spaceId: string | null,
  spaces: Pick<Space, "id">[],
) {
  if (timer.archivedAt) return false
  if (spaceId === null) return true
  if (spaceId === UNASSIGNED_SPACE_ID) return !hasVisibleSpace(spaces, timer.spaceId)
  return timer.spaceId === spaceId
}

function spaceTimerCount(
  spaceId: string | null,
  timers: Pick<Timer, "archivedAt" | "spaceId">[],
  spaces: Pick<Space, "id">[],
) {
  return timers.filter((timer) => timerMatchesSpace(timer, spaceId, spaces)).length
}

function chipClass(active: boolean) {
  return [
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
    active
      ? "bg-foreground text-background"
      : "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
  ].join(" ")
}

// Adding a space happens inline from the bar: a dashed "+" chip opens a small
// popover where you type a name and press Enter (no plus to hunt for in a modal).
// Renaming / recoloring / reordering / deleting spaces lives in project settings.
function SpacesControl() {
  const spaces = useTimerStore((s) => s.spaces)
  const createSpace = useTimerStore((s) => s.createSpace)

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState<string | undefined>()
  const entitlements = getEntitlements()
  const atSpaceLimit = spaces.length >= entitlements.maxSpaces

  const canCreate = newName.trim().length > 0 && !atSpaceLimit

  function handleCreate() {
    if (atSpaceLimit) {
      toast.error(spaceLimitMessage(entitlements))
      return
    }
    if (!canCreate) return
    createSpace(newName, newColor)
    toast.success(formatMessage("space.created"))
    setNewName("")
    setNewColor(undefined)
  }

  return (
    <Popover open={addOpen} onOpenChange={(nextOpen) => setAddOpen(atSpaceLimit ? false : nextOpen)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={formatMessage("space.new")}
              disabled={atSpaceLimit}
              title={atSpaceLimit ? spaceLimitMessage(entitlements) : undefined}
              className={[
                "grid size-7 shrink-0 place-items-center rounded-full transition-colors",
                atSpaceLimit
                  ? "cursor-not-allowed text-muted-foreground/30"
                  : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <PlusIcon className="size-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {atSpaceLimit ? spaceLimitMessage(entitlements) : formatMessage("space.new")}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="grid gap-2">
          <Label htmlFor="new-space-name">{formatMessage("space.new")}</Label>
          <Input
            id="new-space-name"
            value={newName}
            maxLength={30}
            autoFocus
            placeholder={formatMessage("space.placeholder")}
            disabled={atSpaceLimit}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreate()
            }}
          />
          <ColorSwatches value={newColor} onChange={setNewColor} />
          {atSpaceLimit ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              {spaceLimitMessage(entitlements)}
            </div>
          ) : (
            <Button size="sm" disabled={!canCreate} onClick={handleCreate}>
              {formatMessage("space.create")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function OrganizerBar() {
  const timers = useTimerStore((s) => s.timers)
  const spaces = useTimerStore((s) => s.spaces)
  const activeSpaceId = useTimerStore((s) => s.activeSpaceId)
  const setActiveSpace = useTimerStore((s) => s.setActiveSpace)
  const sortMode = useTimerStore((s) => s.sortMode)
  const setTimerSortMode = useTimerStore((s) => s.setTimerSortMode)
  const timerFilters = useTimerStore((s) => s.timerFilters)
  const setTimerFilterType = useTimerStore((s) => s.setTimerFilterType)
  const setTimerFilter = useTimerStore((s) => s.setTimerFilter)
  const clearTimerFilters = useTimerStore((s) => s.clearTimerFilters)
  const nowMs = useNow()
  const [sortOpen, setSortOpen] = useState(false)

  const allCount = spaceTimerCount(null, timers, spaces)
  const activeSpaceTimers = timers.filter((timer) => timerMatchesSpace(timer, activeSpaceId, spaces))
  const activeFilterCount = activeTimerFilterCount(timerFilters)

  return (
    <section className="mb-4 flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="no-scrollbar min-w-0 flex-1 self-center overflow-x-auto">
          <div className="flex min-w-max items-center gap-1.5">
            <button
              type="button"
              className={chipClass(activeSpaceId === null)}
              aria-pressed={activeSpaceId === null}
              onClick={() => setActiveSpace(null)}
            >
              {formatMessage("organizer.all")} <span className="opacity-70">{allCount}</span>
            </button>

            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className={chipClass(activeSpaceId === space.id)}
                aria-pressed={activeSpaceId === space.id}
                onClick={() => setActiveSpace(space.id)}
              >
                <span
                  className="size-2 rounded-full bg-muted-foreground"
                  style={space.color ? { backgroundColor: space.color } : undefined}
                />
                <span className="max-w-28 truncate">{space.name}</span>
                <span className="opacity-70">{spaceTimerCount(space.id, timers, spaces)}</span>
              </button>
            ))}

            <button
              type="button"
              className={chipClass(activeSpaceId === UNASSIGNED_SPACE_ID)}
              aria-pressed={activeSpaceId === UNASSIGNED_SPACE_ID}
              onClick={() => setActiveSpace(UNASSIGNED_SPACE_ID)}
            >
              {formatMessage("organizer.unassigned")}{" "}
              <span className="opacity-70">{spaceTimerCount(UNASSIGNED_SPACE_ID, timers, spaces)}</span>
            </button>
          </div>
        </div>

        <SpacesControl />

        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={formatMessage("organizer.filters.label")}
                  className={[
                    "relative size-8 shrink-0 border-border bg-background text-muted-foreground shadow-none hover:bg-muted hover:text-foreground",
                    activeFilterCount > 0 ? "border-primary/40 bg-primary/[0.04] text-primary hover:text-primary" : "",
                  ].join(" ")}
                >
                  <ListFilterIcon className="size-4" />
                  {activeFilterCount > 0 ? (
                    <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] leading-none text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              {formatMessage("organizer.filters.label")}
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-72 p-1.5">
            <div className="px-1.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {formatMessage("organizer.filters.type")}
            </div>
            <div className="mx-1.5 mb-1 grid grid-cols-3 gap-1 rounded-md bg-muted p-0.5">
              {TYPE_OPTIONS.map((option) => {
                const active = timerFilters.type === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    className={[
                      "whitespace-nowrap rounded-[5px] px-1.5 py-1 text-center text-[11px] font-medium transition-colors",
                      active ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                    onClick={() => setTimerFilterType(option.value)}
                  >
                    {formatMessage(option.labelKey)}
                  </button>
                )
              })}
            </div>
            <div className="my-1 h-px bg-border" />
            <div className="px-1.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {formatMessage("organizer.filters.showOnly")}
            </div>
            {FILTER_OPTIONS.map((option) => {
              const active = timerFilters[option.value]
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => setTimerFilter(option.value, !active)}
                >
                  <span
                    className={[
                      "grid size-4 shrink-0 place-items-center rounded border",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    ].join(" ")}
                  >
                    <CheckIcon className={["size-3", active ? "opacity-100" : "opacity-0"].join(" ")} />
                  </span>
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">{formatMessage(option.labelKey)}</span>
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {timerToggleFilterCount(activeSpaceTimers, option.value, timerFilters.type, nowMs)}
                  </span>
                </button>
              )
            })}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              className="w-full rounded-md px-1.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={clearTimerFilters}
            >
              {formatMessage("organizer.filters.clear")}
            </button>
          </PopoverContent>
        </Popover>

        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={formatMessage("organizer.sort.action")}
                  className="size-8 shrink-0 border-border bg-background text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                >
                  <ArrowUpDownIcon className="size-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              {formatMessage("organizer.sort.action")}
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-52 p-1.5">
            <div className="px-1.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {formatMessage("organizer.sort.heading")}
            </div>
            {SORT_OPTIONS.map((option) => {
              const active = option.value === sortMode
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className={[
                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    active ? "bg-muted" : "",
                  ].join(" ")}
                  onClick={() => {
                    setTimerSortMode(option.value)
                    setSortOpen(false)
                  }}
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">{formatMessage(option.labelKey)}</span>
                  <CheckIcon className={["size-4", active ? "opacity-100" : "opacity-0"].join(" ")} />
                </button>
              )
            })}
          </PopoverContent>
        </Popover>
      </div>
    </section>
  )
}

"use client"

import { ArrowUpDownIcon, CheckIcon, PlusIcon, Settings2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ColorSwatches } from "@/components/spaces-manager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getEntitlements, spaceLimitMessage } from "@/lib/entitlements"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { activeTimerFilterCount, timerHasNotifications, timerIsShared } from "@/lib/timer-filters"
import type { Space, Timer, TimerFilterKey, TimerSortMode } from "@/lib/types"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"

const SORT_OPTIONS: Array<{ value: TimerSortMode; labelKey: MessageKey }> = [
  { value: "manual", labelKey: "organizer.sort.label.manual" },
  { value: "soonest", labelKey: "organizer.sort.label.soonest" },
  { value: "latest", labelKey: "organizer.sort.label.latest" },
  { value: "name_asc", labelKey: "organizer.sort.label.nameAsc" },
  { value: "recently_added", labelKey: "organizer.sort.label.recentlyAdded" },
]

const FILTER_OPTIONS: Array<{ value: TimerFilterKey; labelKey: MessageKey }> = [
  { value: "notifications", labelKey: "organizer.filters.notifications" },
  { value: "shared", labelKey: "organizer.filters.shared" },
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

function timerFilterCount(
  filter: TimerFilterKey,
  timers: Timer[],
  activeSpaceId: string | null,
  spaces: Pick<Space, "id">[],
) {
  return timers.filter((timer) => {
    if (!timerMatchesSpace(timer, activeSpaceId, spaces)) return false
    if (filter === "notifications") return timerHasNotifications(timer)
    return timerIsShared(timer)
  }).length
}

function chipClass(active: boolean) {
  return [
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background text-muted-foreground hover:text-foreground",
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
    <Popover open={addOpen} onOpenChange={setAddOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={formatMessage("space.new")}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1 rounded-full border border-dashed border-muted-foreground/40 bg-background text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground sm:w-auto sm:px-3"
            >
              <PlusIcon className="size-3.5" />
              <span className="hidden sm:inline">{formatMessage("space.new")}</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {formatMessage("space.new")}
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
  const setTimerFilter = useTimerStore((s) => s.setTimerFilter)

  const allCount = spaceTimerCount(null, timers, spaces)
  const activeFilterCount = activeTimerFilterCount(timerFilters)

  return (
    <section className="mb-4 grid min-w-0 gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 self-center overflow-x-auto">
          <div className="flex min-w-max items-center gap-2">
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
                    "relative shrink-0",
                    activeFilterCount > 0 ? "border-primary/40 bg-primary/[0.04] text-primary hover:text-primary" : "",
                  ].join(" ")}
                >
                  <Settings2Icon className="size-4" />
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
          <PopoverContent align="end" className="w-56 p-1">
            {FILTER_OPTIONS.map((option) => {
              const active = timerFilters[option.value]
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => setTimerFilter(option.value, !active)}
                >
                  <CheckIcon className={["size-4", active ? "opacity-100" : "opacity-0"].join(" ")} />
                  <span className="min-w-0 flex-1">{formatMessage(option.labelKey)}</span>
                  <span className="text-xs text-muted-foreground">
                    {timerFilterCount(option.value, timers, activeSpaceId, spaces)}
                  </span>
                </button>
              )
            })}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="mt-1 w-full rounded-md px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  for (const option of FILTER_OPTIONS) setTimerFilter(option.value, false)
                }}
              >
                {formatMessage("organizer.filters.clear")}
              </button>
            ) : null}
          </PopoverContent>
        </Popover>

        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={formatMessage("organizer.sort.action")}
                  className="shrink-0"
                >
                  <ArrowUpDownIcon className="size-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              {formatMessage("organizer.sort.action")}
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-52 p-1">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => setTimerSortMode(option.value)}
              >
                <CheckIcon className={["size-4", option.value === sortMode ? "opacity-100" : "opacity-0"].join(" ")} />
                <span>{formatMessage(option.labelKey)}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </section>
  )
}

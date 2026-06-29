"use client"

import { ArrowRightIcon, CheckIcon, ChevronDownIcon, FolderIcon, LayersIcon, PlusIcon, TimerIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { SettingsSheet } from "@/components/settings-sheet"
import { logClientError, safeClientErrorMessage } from "@/lib/client-errors"
import { formatMessage } from "@/lib/i18n/messages"
import { LIMITS } from "@/lib/limits"
import { useTimerStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function projectTimerCount(args: {
  projectId: string
  activeProjectId: string | null
  projectTimerCount?: number
  activeTimerCount: number
}) {
  return args.projectTimerCount ?? (args.projectId === args.activeProjectId ? args.activeTimerCount : 0)
}

function projectSpaceCount(args: {
  projectId: string
  activeProjectId: string | null
  projectSpaceCount?: number
  activeSpaceCount: number
}) {
  return args.projectSpaceCount ?? (args.projectId === args.activeProjectId ? args.activeSpaceCount : 0)
}

export function ProjectSwitcher() {
  const projects = useTimerStore((s) => s.projects)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const timers = useTimerStore((s) => s.timers)
  const spaces = useTimerStore((s) => s.spaces)
  const hasHydrated = useTimerStore((s) => s.hasHydrated)
  const switchProject = useTimerStore((s) => s.switchProject)
  const createProject = useTimerStore((s) => s.createProject)
  const restoreProjectFromCloud = useTimerStore((s) => s.restoreProjectFromCloud)

  const [open, setOpen] = useState(false)
  const [restoreInput, setRestoreInput] = useState("")
  const [restoreLoading, setRestoreLoading] = useState(false)

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const activeProjectName = activeProject?.name ?? formatMessage("project.defaultName")
  const atProjectLimit = projects.length >= LIMITS.projects

  if (hasHydrated && projects.length === 0) return null

  async function handleRestore() {
    const key = restoreInput.trim()
    if (!key) return
    setRestoreLoading(true)
    try {
      await restoreProjectFromCloud(key)
      toast.success(formatMessage("project.restored"))
      setRestoreInput("")
      setOpen(false)
    } catch (err) {
      logClientError("projectSwitcher.restoreProject", err)
      toast.error(safeClientErrorMessage(err, "errors.restoreFailed"))
    } finally {
      setRestoreLoading(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="project-switcher-trigger h-8 w-fit min-w-0 justify-start overflow-hidden px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={!hasHydrated}
          aria-label={formatMessage("project.switch")}
          title={activeProjectName}
        >
          <FolderIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{activeProjectName}</span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent forceMount hidden={!open} align="start" className="w-[296px] p-1.5">
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {formatMessage("project.listHeading", { count: projects.length, max: LIMITS.projects })}
          </span>
          <SettingsSheet
            className="size-6 rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
            showTriggerTooltip={false}
            onTriggerClick={() => setOpen(false)}
          />
        </div>

        <div className="grid max-h-56 gap-0.5 overflow-y-auto">
          {projects.map((project) => {
            const selected = project.id === activeProjectId
            const timerCount = projectTimerCount({
              projectId: project.id,
              activeProjectId,
              projectTimerCount: project.timerCount,
              activeTimerCount: timers.length,
            })
            const spaceCount = projectSpaceCount({
              projectId: project.id,
              activeProjectId,
              projectSpaceCount: project.spaceCount,
              activeSpaceCount: spaces.length,
            })

            return (
              <button
                key={project.id}
                type="button"
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors focus-visible:bg-muted focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  selected ? "bg-muted" : "hover:bg-muted",
                )}
                onClick={() => {
                  switchProject(project.id)
                  setOpen(false)
                }}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground">
                  {selected ? <CheckIcon className="size-4 text-foreground" /> : <FolderIcon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-medium" title={project.name}>
                      {project.name}
                    </span>
                    {!project.cloudProjectId ? (
                      <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase leading-none text-muted-foreground">
                        {formatMessage("project.local")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                    <span
                      className="inline-flex items-center gap-1"
                      aria-label={formatMessage("project.timerUsage", {
                        count: timerCount,
                        max: LIMITS.timersPerProject,
                      })}
                    >
                      <TimerIcon className="size-3" />
                      <span className="tabular-nums">
                        {formatMessage("project.usageFraction", { count: timerCount, max: LIMITS.timersPerProject })}
                      </span>
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      aria-label={formatMessage("project.spaceUsage", {
                        count: spaceCount,
                        max: LIMITS.spacesPerProject,
                      })}
                    >
                      <LayersIcon className="size-3" />
                      <span className="tabular-nums">
                        {formatMessage("project.usageFraction", { count: spaceCount, max: LIMITS.spacesPerProject })}
                      </span>
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <Separator className="my-1.5" />

        <div className="grid gap-1">
          <Button
            variant="ghost"
            className="h-auto w-full justify-start px-2 py-2 text-sm font-normal"
            disabled={atProjectLimit}
            title={atProjectLimit ? formatMessage("project.limit.total", { max: LIMITS.projects }) : undefined}
            onClick={() => {
              createProject(formatMessage("project.new"))
              toast.success(formatMessage("project.created"))
              setOpen(false)
            }}
          >
            <PlusIcon className="size-4" />
            {formatMessage("project.new")}
          </Button>
          <div className="px-2 pb-1 pt-1.5">
            <label
              htmlFor="project-restore-key"
              className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70"
            >
              {formatMessage("project.restoreFromKey")}
            </label>
            <div className="flex gap-1.5">
              <Input
                id="project-restore-key"
                value={restoreInput}
                onChange={(event) => setRestoreInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleRestore()
                }}
                placeholder={formatMessage("project.restoreKeyPlaceholder")}
                className="h-8 min-w-0 flex-1 px-2 font-mono text-xs placeholder:font-sans"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                loading={restoreLoading}
                disabled={!restoreInput.trim()}
                onClick={() => void handleRestore()}
                aria-label={formatMessage("project.restore")}
              >
                {!restoreLoading && <ArrowRightIcon className="size-4" />}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground/80">
              {formatMessage("project.restoreKeySwitchDescription")}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

"use client"

import { CheckIcon, FolderIcon, PlusIcon, UploadIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { SettingsSheet } from "@/components/settings-sheet"
import { logClientError, safeClientErrorMessage } from "@/lib/client-errors"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function shortKey(key: string) {
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

function projectStatus(args: { isCheckingCloud: boolean; isSyncing: boolean; restoreKey: string | null }) {
  if (args.isCheckingCloud) return formatMessage("project.status.checking")
  if (args.isSyncing) return formatMessage("project.status.syncing")
  if (args.restoreKey) return shortKey(args.restoreKey)
  return formatMessage("project.local")
}

function timerCountLabel(count: number) {
  return formatMessage(count === 1 ? "timer.count.one" : "timer.count.many", { count })
}

export function ProjectSwitcher() {
  const projects = useTimerStore((s) => s.projects)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const restoreKey = useTimerStore((s) => s.restoreKey)
  const hasHydrated = useTimerStore((s) => s.hasHydrated)
  const isSyncing = useTimerStore((s) => s.isSyncing)
  const isCheckingCloud = useTimerStore((s) => s.isCheckingCloud)
  const switchProject = useTimerStore((s) => s.switchProject)
  const createProject = useTimerStore((s) => s.createProject)
  const restoreProjectFromCloud = useTimerStore((s) => s.restoreProjectFromCloud)

  const [open, setOpen] = useState(false)
  const [restoreInput, setRestoreInput] = useState("")
  const [restoreLoading, setRestoreLoading] = useState(false)

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const activeProjectName = activeProject?.name ?? formatMessage("project.defaultName")
  const status = projectStatus({ isCheckingCloud, isSyncing, restoreKey })

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
          variant="outline"
          size="sm"
          className="project-switcher-trigger w-fit min-w-0 justify-start overflow-hidden px-2.5"
          disabled={!hasHydrated}
          aria-label={formatMessage("project.switch")}
          title={activeProjectName}
        >
          <FolderIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{activeProjectName}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent forceMount hidden={!open} align="end" className="w-80 p-2">
        <div className="flex items-start gap-2 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" title={activeProjectName}>
              {activeProjectName}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{status}</div>
          </div>
          <SettingsSheet
            className="-mr-1 -mt-1 size-8"
            showTriggerTooltip={false}
            onTriggerClick={() => setOpen(false)}
          />
        </div>

        <Separator className="my-2" />

        <div className="grid max-h-56 gap-1 overflow-y-auto p-0.5">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                project.id === activeProjectId && "bg-muted hover:bg-muted",
              )}
              onClick={() => {
                switchProject(project.id)
                setOpen(false)
              }}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
                {project.id === activeProjectId ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <FolderIcon className="size-4 text-muted-foreground" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate font-medium" title={project.name}>
                    {project.name}
                  </span>
                  {!project.cloudProjectId ? (
                    <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none text-muted-foreground">
                      {formatMessage("project.local")}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shortKey(project.restoreKey)}
                  {project.timerCount === undefined ? "" : ` · ${timerCountLabel(project.timerCount)}`}
                </span>
              </span>
            </button>
          ))}
        </div>

        <Separator className="my-2" />

        <div className="grid gap-2 px-2 py-1">
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() => {
              createProject(formatMessage("project.new"))
              toast.success(formatMessage("project.created"))
              setOpen(false)
            }}
          >
            <PlusIcon className="size-4" />
            {formatMessage("project.new")}
          </Button>
          <div className="flex gap-2">
            <Input
              value={restoreInput}
              onChange={(event) => setRestoreInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleRestore()
              }}
              placeholder={formatMessage("project.restoreKey")}
              className="h-9"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              loading={restoreLoading}
              disabled={!restoreInput.trim()}
              onClick={() => void handleRestore()}
              aria-label={formatMessage("project.restore")}
            >
              {!restoreLoading && <UploadIcon className="size-4" />}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

"use client"

import {
  AlertCircleIcon,
  CloudIcon,
  CloudDownloadIcon,
  CloudUploadIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { useRef, useState, type ComponentProps, type WheelEvent } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ProjectClaimSlot } from "@/components/project-claim-slot"
import { useMediaQuery } from "@/hooks/use-media-query"
import { logClientError, safeClientErrorMessage } from "@/lib/client-errors"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"

type SettingsSheetProps = {
  className?: string
  onTriggerClick?: () => void
  showTriggerTooltip?: boolean
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
}

function forwardWheelToSettingsScroller(event: WheelEvent, scroller: HTMLDivElement | null) {
  if (!scroller || event.defaultPrevented || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  if (event.target instanceof Node && scroller.contains(event.target)) return

  const maxScrollTop = scroller.scrollHeight - scroller.clientHeight
  if (maxScrollTop <= 0) return

  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, scroller.scrollTop + event.deltaY))
  if (nextScrollTop === scroller.scrollTop) return

  scroller.scrollTop = nextScrollTop
}

async function syncProjectAction(syncToCloud: (opts?: { force?: boolean }) => Promise<boolean>) {
  const synced = await syncToCloud({ force: false })
  if (synced) {
    toast.success(formatMessage("project.synced"))
  } else {
    toast.error(formatMessage("project.syncNeedsAttention"))
  }
}

async function refreshProjectAction(refreshActiveProjectFromCloud: () => Promise<void>) {
  await refreshActiveProjectFromCloud()
  toast.success(formatMessage("project.refreshed"))
}

async function deleteProjectAction(args: {
  closeSheet: () => void
  deleteActiveProjectFromCloud: () => Promise<void>
}) {
  await args.deleteActiveProjectFromCloud()
  toast.success(formatMessage("project.deleted"))
  args.closeSheet()
}

function projectNameForSheetOpen(nextOpen: boolean, currentName: string | undefined, previousName: string) {
  if (nextOpen) return currentName ?? ""
  return previousName
}

function sheetContentClassName(side: "bottom" | "right") {
  if (side === "bottom") return "max-h-[85dvh] overflow-hidden rounded-t-2xl p-0"
  return "h-dvh overflow-hidden p-0"
}

const passwordManagerIgnoreProps = {
  autoComplete: "off",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-nordpass-ignore": "true",
  "data-np-autofill": "false",
  "data-np-ignore": "true",
} as const

type SettingsTriggerButtonProps = Omit<SettingsSheetProps, "showTriggerTooltip"> &
  Omit<ComponentProps<"button">, "children">

function SettingsTriggerButton({
  className,
  onTriggerClick,
  onClick,
  ...buttonProps
}: Readonly<SettingsTriggerButtonProps>) {
  return (
    <Button
      {...buttonProps}
      type="button"
      variant="ghost"
      size="icon"
      aria-label={formatMessage("settings.title")}
      className={className}
      onClick={(event) => {
        onClick?.(event)
        onTriggerClick?.()
      }}
    >
      <SettingsIcon className="size-5" />
    </Button>
  )
}

function SyncErrorStatus(props: Readonly<{ message: string | null }>) {
  if (!props.message) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="mt-2 inline-flex w-fit items-center gap-1.5 text-xs font-medium text-destructive outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          <AlertCircleIcon className="size-3.5" />
          {formatMessage("project.syncError")}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-[260px] text-center">
        {props.message}
      </TooltipContent>
    </Tooltip>
  )
}

export function SettingsSheet({ showTriggerTooltip = true, ...props }: Readonly<SettingsSheetProps>) {
  const [open, setOpen] = useState(false)
  const initialFocusRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const projects = useTimerStore((s) => s.projects)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const restoreKey = useTimerStore((s) => s.restoreKey)
  const renameActiveProject = useTimerStore((s) => s.renameActiveProject)
  const syncToCloud = useTimerStore((s) => s.syncToCloud)
  const refreshActiveProjectFromCloud = useTimerStore((s) => s.refreshActiveProjectFromCloud)
  const deleteActiveProjectFromCloud = useTimerStore((s) => s.deleteActiveProjectFromCloud)
  const clearAllTimers = useTimerStore((s) => s.clearAllTimers)
  const timers = useTimerStore((s) => s.timers)
  const lastSyncError = useTimerStore((s) => s.lastSyncError)
  const isSyncing = useTimerStore((s) => s.isSyncing)
  const isCheckingCloud = useTimerStore((s) => s.isCheckingCloud)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const accountBackedProject = Boolean(activeProject?.cloudProjectId)
  const visibleRestoreKey = accountBackedProject ? null : restoreKey

  const [projectName, setProjectName] = useState(activeProject?.name ?? "")
  const [syncLoading, setSyncLoading] = useState(false)
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false)
  const [restoreKeyRevealed, setRestoreKeyRevealed] = useState(false)
  const [clearProjectConfirmation, setClearProjectConfirmation] = useState("")
  const [deleteProjectConfirmation, setDeleteProjectConfirmation] = useState("")
  const activeProjectName = activeProject?.name ?? formatMessage("project.defaultName")
  const canClearProject = clearProjectConfirmation.trim() === activeProjectName
  const canDeleteProject = deleteProjectConfirmation.trim() === activeProjectName

  function handleOpenChange(nextOpen: boolean) {
    setProjectName(projectNameForSheetOpen(nextOpen, activeProject?.name, projectName))
    if (!nextOpen) setRestoreKeyRevealed(false)
    setOpen(nextOpen)
  }

  async function handleSyncNow() {
    setSyncLoading(true)
    try {
      await syncProjectAction(syncToCloud)
    } catch (err) {
      logClientError("settings.syncProject", err)
      toast.error(safeClientErrorMessage(err, "errors.syncFailed"))
    } finally {
      setSyncLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshLoading(true)
    try {
      await refreshProjectAction(refreshActiveProjectFromCloud)
    } catch (err) {
      logClientError("settings.refreshProject", err)
      toast.error(safeClientErrorMessage(err, "errors.refreshFailed"))
    } finally {
      setRefreshLoading(false)
    }
  }

  async function handleDeleteProject() {
    setDeleteProjectLoading(true)
    try {
      await deleteProjectAction({
        closeSheet: () => setOpen(false),
        deleteActiveProjectFromCloud,
      })
    } catch (err) {
      logClientError("settings.deleteProject", err)
      toast.error(safeClientErrorMessage(err, "errors.deleteFailed"))
    } finally {
      setDeleteProjectLoading(false)
    }
  }

  function handleWheelCapture(event: WheelEvent) {
    forwardWheelToSettingsScroller(event, scrollContainerRef.current)
  }

  function handleOpenAutoFocus(event: Event) {
    event.preventDefault()
    initialFocusRef.current?.focus({ preventScroll: true })
  }

  const side = isDesktop ? "right" : "bottom"
  const canRename = projectName.trim().length > 0 && projectName.trim() !== activeProject?.name
  const trigger = (
    <SheetTrigger asChild>
      <SettingsTriggerButton {...props} />
    </SheetTrigger>
  )

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {showTriggerTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {formatMessage("settings.title")}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <SheetContent
        side={side}
        className={sheetContentClassName(side)}
        onOpenAutoFocus={handleOpenAutoFocus}
        onWheelCapture={handleWheelCapture}
      >
        <div ref={initialFocusRef} tabIndex={-1} className="outline-none">
          <SheetHeader className="shrink-0">
            <SheetTitle>{formatMessage("settings.title")}</SheetTitle>
            <SheetDescription>{formatMessage("settings.description")}</SheetDescription>
          </SheetHeader>
        </div>

        <div
          ref={scrollContainerRef}
          data-slot="settings-scroll-container"
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-6"
        >
          <div className="grid gap-4 pt-4">
            <div data-settings-section="project" className="grid scroll-mt-3 gap-4 rounded-lg border p-4">
              <div className="grid gap-1">
                <div className="text-sm font-medium">{formatMessage("project.current")}</div>
                <div className="text-xs text-muted-foreground">{formatMessage("settings.projectDescription")}</div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="projectName">{formatMessage("project.name")}</Label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input
                    id="projectName"
                    value={projectName}
                    maxLength={40}
                    {...passwordManagerIgnoreProps}
                    onChange={(event) => setProjectName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canRename) {
                        renameActiveProject(projectName)
                        toast.success(formatMessage("project.renamed"))
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    disabled={!canRename}
                    onClick={() => {
                      renameActiveProject(projectName)
                      toast.success(formatMessage("project.renamed"))
                    }}
                  >
                    {formatMessage("common.save")}
                  </Button>
                </div>
              </div>

              {accountBackedProject ? (
                <div className="rounded-xl border bg-muted/30 p-3">
                  <div className="flex gap-3">
                    <CloudIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{formatMessage("project.accountStorageTitle")}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatMessage("project.accountStorageDescription")}
                      </div>
                    </div>
                  </div>
                  <SyncErrorStatus message={lastSyncError} />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="restoreKey">{formatMessage("project.restoreKey")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="restoreKey"
                      type={restoreKeyRevealed ? "text" : "password"}
                      value={visibleRestoreKey ?? ""}
                      readOnly
                      {...passwordManagerIgnoreProps}
                      placeholder={formatMessage("project.noKeyYet")}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label={formatMessage(
                        restoreKeyRevealed ? "project.hideRestoreKey" : "project.showRestoreKey",
                      )}
                      disabled={!visibleRestoreKey}
                      onClick={() => setRestoreKeyRevealed((revealed) => !revealed)}
                    >
                      {restoreKeyRevealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label={formatMessage("project.copyRestoreKey")}
                      disabled={!visibleRestoreKey}
                      onClick={async () => {
                        if (!visibleRestoreKey) return
                        await copy(visibleRestoreKey)
                        toast.success(formatMessage("project.keyCopied"))
                      }}
                    >
                      <CopyIcon className="size-4" />
                    </Button>
                  </div>
                  {visibleRestoreKey ? (
                    <div className="text-xs text-muted-foreground">
                      {formatMessage("project.restoreKeyDescription")}
                    </div>
                  ) : null}
                  <ProjectClaimSlot
                    restoreKey={restoreKey}
                    projectName={activeProject?.name ?? formatMessage("project.defaultName")}
                    cloudProjectId={activeProject?.cloudProjectId}
                  />
                  <SyncErrorStatus message={lastSyncError} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={syncLoading || isSyncing}
                  onClick={() => void handleSyncNow()}
                >
                  <CloudUploadIcon className="size-4" />
                  {formatMessage("project.sync")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={refreshLoading || isCheckingCloud}
                  onClick={() => void handleRefresh()}
                >
                  <CloudDownloadIcon className="size-4" />
                  {formatMessage("project.refresh")}
                </Button>
              </div>
            </div>

            <div data-settings-section="cleanup" className="grid scroll-mt-3 gap-4 rounded-lg border p-4">
              <div className="grid gap-1">
                <div className="text-sm font-medium">{formatMessage("settings.projectCleanup")}</div>
                <div className="text-xs text-muted-foreground">
                  {formatMessage("settings.projectCleanupDescription")}
                </div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-sm font-medium">{formatMessage("timer.clearProjectTitle")}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatMessage("timer.clearProjectDescription")}
                </div>
                <AlertDialog
                  onOpenChange={(nextOpen) => {
                    if (nextOpen) setClearProjectConfirmation("")
                  }}
                >
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="mt-3 w-full">
                      <Trash2Icon className="mr-1.5 size-4" />
                      {formatMessage("timer.clearProject")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{formatMessage("timer.clearProjectTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {formatMessage("timer.removeAllDescription", {
                          count: timers.length,
                          timerLabel: formatMessage(timers.length === 1 ? "timer.count.one" : "timer.count.many", {
                            count: timers.length,
                          }),
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="grid gap-2 text-left">
                      <Label htmlFor="clear-project-confirm">
                        {formatMessage("settings.confirmProjectName", { project: activeProjectName })}
                      </Label>
                      <Input
                        id="clear-project-confirm"
                        value={clearProjectConfirmation}
                        placeholder={activeProjectName}
                        {...passwordManagerIgnoreProps}
                        onChange={(event) => setClearProjectConfirmation(event.target.value)}
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{formatMessage("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={!canClearProject}
                        onClick={(event) => {
                          if (!canClearProject) {
                            event.preventDefault()
                            return
                          }
                          clearAllTimers()
                          toast.success(formatMessage("timer.removedAll"))
                        }}
                      >
                        {formatMessage("timer.clearAll")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-sm font-medium">{formatMessage("project.delete")}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatMessage(
                    accountBackedProject ? "project.deleteAccountDescription" : "project.deleteDescription",
                  )}
                </div>
                <AlertDialog
                  onOpenChange={(nextOpen) => {
                    if (nextOpen) setDeleteProjectConfirmation("")
                  }}
                >
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="mt-3 w-full">
                      <Trash2Icon className="mr-1.5 size-4" />
                      {formatMessage("project.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{formatMessage("project.deleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {formatMessage(accountBackedProject ? "project.deleteAccountWarning" : "project.deleteWarning")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="grid gap-2 text-left">
                      <Label htmlFor="delete-project-confirm">
                        {formatMessage("settings.confirmProjectName", { project: activeProjectName })}
                      </Label>
                      <Input
                        id="delete-project-confirm"
                        value={deleteProjectConfirmation}
                        placeholder={activeProjectName}
                        {...passwordManagerIgnoreProps}
                        onChange={(event) => setDeleteProjectConfirmation(event.target.value)}
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{formatMessage("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={deleteProjectLoading || !canDeleteProject}
                        onClick={(event) => {
                          if (!canDeleteProject) {
                            event.preventDefault()
                            return
                          }
                          event.preventDefault()
                          void handleDeleteProject()
                        }}
                      >
                        {formatMessage("project.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

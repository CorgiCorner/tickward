"use client"

import { AlertCircleIcon, CloudIcon, CopyIcon, SettingsIcon, ChevronRightIcon } from "lucide-react"
import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type WheelEvent } from "react"
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
import { SpacesManager } from "@/components/spaces-manager"
import { useMediaQuery } from "@/hooks/use-media-query"
import { logClientError, safeClientErrorMessage } from "@/lib/client-errors"
import { authClient } from "@/lib/auth/auth-client"
import { getEntitlements } from "@/lib/entitlements"
import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"

type SettingsSheetProps = {
  className?: string
  onTriggerClick?: () => void
  showTriggerTooltip?: boolean
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
}

function ProjectIdRow(props: Readonly<{ cloudProjectId: string }>) {
  return (
    <div className="mt-3 grid gap-2 border-t pt-3">
      <Label htmlFor="projectId">{formatMessage("project.idLabel")}</Label>
      <div className="flex items-center gap-2">
        <Input
          inputSize="sm"
          className="min-w-0 font-mono text-xs"
          id="projectId"
          value={props.cloudProjectId}
          readOnly
        />
        <Button
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          aria-label={formatMessage("project.copyId")}
          onClick={async () => {
            await copy(props.cloudProjectId)
            toast.success(formatMessage("project.idCopied"))
          }}
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">{formatMessage("project.idDescription")}</div>
    </div>
  )
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

function SettingsTrigger(
  props: Readonly<{
    showTooltip: boolean
    trigger: ReactNode
  }>,
) {
  if (!props.showTooltip) return <>{props.trigger}</>

  return (
    <Tooltip>
      <TooltipTrigger asChild>{props.trigger}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {formatMessage("settings.title")}
      </TooltipContent>
    </Tooltip>
  )
}

function ProjectStorageSection(
  props: Readonly<{
    accountBackedProject: boolean
    activeProjectName: string
    cloudProjectId?: string
    lastSyncError: string | null
    onToggleRestoreKey: () => void
    restoreKey: string | null
    restoreKeyRevealed: boolean
    visibleRestoreKey: string | null
  }>,
) {
  const claimActiveProject = useTimerStore((s) => s.claimActiveProject)
  const session = authClient.useSession()
  if (props.accountBackedProject) {
    return (
      <div className="grid gap-2">
        <div className="flex gap-3">
          <CloudIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-medium">{formatMessage("project.accountStorageTitle")}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatMessage("project.accountStorageDescription")}
            </div>
          </div>
        </div>
        <SyncErrorStatus message={props.lastSyncError} />
        {props.cloudProjectId ? <ProjectIdRow cloudProjectId={props.cloudProjectId} /> : null}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="restoreKey">{formatMessage("project.useAnotherDevice")}</Label>
      <div className="flex items-center gap-2">
        <Input
          inputSize="sm"
          className="min-w-0 font-mono"
          id="restoreKey"
          type={props.restoreKeyRevealed ? "text" : "password"}
          value={props.visibleRestoreKey ?? ""}
          readOnly
          {...passwordManagerIgnoreProps}
          placeholder={formatMessage("project.noKeyYet")}
        />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label={formatMessage(props.restoreKeyRevealed ? "project.hideRestoreKey" : "project.showRestoreKey")}
          disabled={!props.visibleRestoreKey}
          onClick={props.onToggleRestoreKey}
        >
          {formatMessage(props.restoreKeyRevealed ? "project.hide" : "project.show")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label={formatMessage("project.copyRestoreKey")}
          disabled={!props.visibleRestoreKey}
          onClick={async () => {
            if (!props.visibleRestoreKey) return
            await copy(props.visibleRestoreKey)
            toast.success(formatMessage("project.keyCopied"))
          }}
        >
          {formatMessage("project.copy")}
        </Button>
      </div>
      {props.visibleRestoreKey ? (
        <div className="text-xs text-muted-foreground">{formatMessage("project.restoreDeviceHint")}</div>
      ) : null}
      {session.data?.user ? (
        <ProjectClaimSlot
          variant="button"
          claimActiveProject={claimActiveProject}
          restoreKey={props.restoreKey}
          projectName={props.activeProjectName}
          cloudProjectId={props.cloudProjectId}
        />
      ) : null}
      <SyncErrorStatus message={props.lastSyncError} />
    </div>
  )
}

function ConfirmProjectNameField(
  props: Readonly<{
    id: string
    projectName: string
    value: string
    onChange: (value: string) => void
  }>,
) {
  return (
    <div className="grid gap-2 text-left">
      <Label htmlFor={props.id}>{formatMessage("settings.confirmProjectName", { project: props.projectName })}</Label>
      <Input
        id={props.id}
        value={props.value}
        placeholder={props.projectName}
        {...passwordManagerIgnoreProps}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  )
}

function ProjectCleanupSection(
  props: Readonly<{
    accountBackedProject: boolean
    activeProjectName: string
    canClearProject: boolean
    canDeleteProject: boolean
    clearAllTimers: () => void
    clearProjectConfirmation: string
    deleteProjectConfirmation: string
    deleteProjectLoading: boolean
    onClearProjectConfirmationChange: (value: string) => void
    onDeleteProject: () => void
    onDeleteProjectConfirmationChange: (value: string) => void
    timerCount: number
  }>,
) {
  return (
    <div data-settings-section="cleanup" className="flex scroll-mt-3 items-center justify-between gap-2 border-t pt-4">
      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (nextOpen) props.onClearProjectConfirmationChange("")
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={props.timerCount === 0}>
            {formatMessage("timer.clearAll")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{formatMessage("timer.clearProjectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {formatMessage("timer.removeAllDescription", {
                count: props.timerCount,
                timerLabel: formatPluralMessage("timer.count", props.timerCount),
              })}{" "}{formatMessage("timer.clearProjectDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ConfirmProjectNameField
            id="clear-project-confirm"
            projectName={props.activeProjectName}
            value={props.clearProjectConfirmation}
            onChange={props.onClearProjectConfirmationChange}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{formatMessage("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!props.canClearProject}
              onClick={(event) => {
                if (!props.canClearProject) {
                  event.preventDefault()
                  return
                }
                props.clearAllTimers()
                toast.success(formatMessage("timer.removedAll"))
              }}
            >
              {formatMessage("timer.clearAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (nextOpen) props.onDeleteProjectConfirmationChange("")
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:text-destructive">
            {formatMessage("project.delete")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{formatMessage("project.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {formatMessage(props.accountBackedProject ? "project.deleteAccountWarning" : "project.deleteWarning")}
              {!props.accountBackedProject ? <>{" "}{formatMessage("project.deleteDescription")}</> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ConfirmProjectNameField
            id="delete-project-confirm"
            projectName={props.activeProjectName}
            value={props.deleteProjectConfirmation}
            onChange={props.onDeleteProjectConfirmationChange}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{formatMessage("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={props.deleteProjectLoading || !props.canDeleteProject}
              onClick={(event) => {
                if (!props.canDeleteProject) {
                  event.preventDefault()
                  return
                }
                event.preventDefault()
                props.onDeleteProject()
              }}
            >
              {formatMessage("project.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  const deleteActiveProjectFromCloud = useTimerStore((s) => s.deleteActiveProjectFromCloud)
  const clearAllTimers = useTimerStore((s) => s.clearAllTimers)
  const timers = useTimerStore((s) => s.timers)
  const spaces = useTimerStore((s) => s.spaces)
  const lastSyncError = useTimerStore((s) => s.lastSyncError)
  const isSyncing = useTimerStore((s) => s.isSyncing)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const accountBackedProject = Boolean(activeProject?.cloudProjectId)
  const visibleRestoreKey = accountBackedProject ? null : restoreKey

  const [spacesOpen, setSpacesOpen] = useState(false)
  const lastSavedName = useRef<string | undefined>(undefined)
  const [projectName, setProjectName] = useState(activeProject?.name ?? "")
  const [syncLoading, setSyncLoading] = useState(false)
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false)
  const [restoreKeyRevealed, setRestoreKeyRevealed] = useState(false)
  const [clearProjectConfirmation, setClearProjectConfirmation] = useState("")
  const [deleteProjectConfirmation, setDeleteProjectConfirmation] = useState("")
  const activeProjectName = activeProject?.name ?? formatMessage("project.defaultName")
  const canClearProject = clearProjectConfirmation === activeProjectName
  const canDeleteProject = deleteProjectConfirmation === activeProjectName

  useEffect(() => {
    lastSavedName.current = activeProject?.name
  }, [activeProjectId, activeProject?.name])

  function handleOpenChange(nextOpen: boolean) {
    setProjectName(projectNameForSheetOpen(nextOpen, activeProject?.name, projectName))
    if (nextOpen) lastSavedName.current = activeProject?.name
    if (!nextOpen) {
      setRestoreKeyRevealed(false)
      setSpacesOpen(false)
    }
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

  function saveName() {
    const trimmed = projectName.trim()
    if (!trimmed) {
      setProjectName(activeProjectName)
      return
    }
    setProjectName(trimmed)
    if (trimmed === (lastSavedName.current ?? activeProjectName)) return
    lastSavedName.current = trimmed
    renameActiveProject(trimmed)
    toast.success(formatMessage("project.renamed"))
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
  const trigger = (
    <SheetTrigger asChild>
      <SettingsTriggerButton {...props} />
    </SheetTrigger>
  )

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SettingsTrigger showTooltip={showTriggerTooltip} trigger={trigger} />
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
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="grid gap-4 pt-4">
            <div data-settings-section="project" className="grid scroll-mt-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="projectName">{formatMessage("project.name")}</Label>
                <Input
                  id="projectName"
                  inputSize="sm"
                  value={projectName}
                  maxLength={40}
                  {...passwordManagerIgnoreProps}
                  onChange={(event) => setProjectName(event.target.value)}
                  onBlur={saveName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      saveName()
                    }
                  }}
                />
              </div>
              <div className="grid gap-2 border-t pt-4">
                {accountBackedProject ? <Label>{formatMessage("project.useAnotherDevice")}</Label> : null}
                <ProjectStorageSection
                  accountBackedProject={accountBackedProject}
                  activeProjectName={activeProjectName}
                  cloudProjectId={activeProject?.cloudProjectId}
                  lastSyncError={lastSyncError}
                  restoreKey={restoreKey}
                  restoreKeyRevealed={restoreKeyRevealed}
                  visibleRestoreKey={visibleRestoreKey}
                  onToggleRestoreKey={() => setRestoreKeyRevealed((revealed) => !revealed)}
                />
                {lastSyncError ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    loading={syncLoading || isSyncing}
                    onClick={() => void handleSyncNow()}
                  >
                    {formatMessage("project.tryAgain")}
                  </Button>
                ) : null}
              </div>
              <div data-settings-section="spaces" className="scroll-mt-3 border-t pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mx-3 w-[calc(100%+1.5rem)] justify-between"
                  aria-expanded={spacesOpen}
                  onClick={() => setSpacesOpen((value) => !value)}
                >
                  <span>{formatMessage("space.dialogTitle")}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {formatMessage("project.countOfMax", {
                      count: spaces?.length ?? 0,
                      max: getEntitlements().maxSpaces,
                    })}
                    <ChevronRightIcon
                      className={spacesOpen ? "rotate-90 transition-transform" : "transition-transform"}
                    />
                  </span>
                </Button>
                {spacesOpen ? (
                  <div className="animate-in fade-in duration-enter pt-3">
                    <SpacesManager />
                  </div>
                ) : null}
              </div>
            </div>

            <ProjectCleanupSection
              accountBackedProject={accountBackedProject}
              activeProjectName={activeProjectName}
              canClearProject={canClearProject}
              canDeleteProject={canDeleteProject}
              clearAllTimers={clearAllTimers}
              clearProjectConfirmation={clearProjectConfirmation}
              deleteProjectConfirmation={deleteProjectConfirmation}
              deleteProjectLoading={deleteProjectLoading}
              timerCount={timers.length}
              onClearProjectConfirmationChange={setClearProjectConfirmation}
              onDeleteProject={() => void handleDeleteProject()}
              onDeleteProjectConfirmationChange={setDeleteProjectConfirmation}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

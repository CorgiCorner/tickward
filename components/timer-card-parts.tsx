import {
  BellIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  LockIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RepeatIcon,
} from "lucide-react"
import Image from "next/image"
import { useState, type MouseEvent, type ReactNode } from "react"

import { CountdownDisplay } from "@/components/countdown-display"
import { EmbedSnippetControls, parseShareUrl } from "@/components/embed-snippet"
import { TimerFocusAction } from "@/components/timer-focus-mode"
import { TimerForm, type TimerFormSubmitValue } from "@/components/timer-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage } from "@/lib/i18n/messages"
import type { Timer } from "@/lib/types"
import { cn, formatTargetInTimeZone } from "@/lib/utils"

type RecurrenceHistory = {
  count: number
  last: string | null
}

const timerActionClassName =
  "text-muted-foreground/75 hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50"

type StopPropagationEvent = {
  stopPropagation: () => void
}

export function TimerCardContent(
  props: Readonly<{
    timer: Timer
    effectiveTarget: string
    nowMs: number
    sub: string
    isArchived: boolean
    isPinned: boolean
    isRecurring: boolean
    history: RecurrenceHistory
    dragHandle?: ReactNode
    mobileActions: ReactNode
    desktopActions: ReactNode
    onMobileCardTap?: () => void
  }>,
) {
  function handleRootClick(event: MouseEvent<HTMLDivElement>) {
    if (!props.onMobileCardTap) return
    if (event.target instanceof Element && event.target.closest("[data-timer-card-action]")) return
    props.onMobileCardTap()
  }

  return (
    <div
      className={[
        "group relative min-w-0 w-full md:rounded-2xl md:border bg-card p-5 transition-colors",
        props.isPinned
          ? "border-l-2 border-l-primary/45 bg-primary/[0.025] md:border-primary/15 dark:bg-primary/[0.04]"
          : "md:border-border",
        props.isArchived ? "bg-muted/30" : "",
      ].join(" ")}
      onClick={handleRootClick}
    >
      {props.mobileActions}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1.5">
          {props.dragHandle}
          <TimerCardTitleBlock
            timer={props.timer}
            sub={props.sub}
            isArchived={props.isArchived}
            isRecurring={props.isRecurring}
            history={props.history}
          />
        </div>

        {props.desktopActions}
      </div>

      <div className="mt-5">
        <CountdownDisplay targetDateIsoUtc={props.effectiveTarget} nowMs={props.nowMs} />
      </div>
    </div>
  )
}

function TimerCardTitleBlock(
  props: Readonly<{
    timer: Timer
    sub: string
    isArchived: boolean
    isRecurring: boolean
    history: RecurrenceHistory
  }>,
) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {props.timer.image ? (
        <Image
          src={props.timer.image.thumbUrl}
          alt=""
          width={48}
          height={48}
          unoptimized
          className="size-12 shrink-0 rounded-xl object-cover"
        />
      ) : null}
      <div className={["min-w-0", props.isArchived ? "pr-28 md:pr-0" : "pr-36 md:pr-0"].join(" ")}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-base font-semibold">{props.timer.label}</div>
          {props.timer.notify === true || props.timer.notification?.enabled === true ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <BellIcon
                  aria-label={formatMessage("timer.notificationsOn")}
                  className="size-3.5 shrink-0 text-muted-foreground/70"
                />
              </TooltipTrigger>
              <TooltipContent>{formatMessage("timer.notificationsOn")}</TooltipContent>
            </Tooltip>
          ) : null}
          {props.isRecurring ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  <RepeatIcon className="size-3" />
                  {props.timer.recurrence?.type}
                  {props.history.count > 0 ? ` · ${props.history.count}x` : null}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {props.history.count > 0 && props.history.last
                  ? formatMessage("timer.recurrence.history", {
                      count: props.history.count,
                      last: formatTargetInTimeZone(props.history.last, props.timer.timezone),
                    })
                  : formatMessage("timer.recurrence.nextShown")}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {props.isArchived ? (
            <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {formatMessage("timer.recurrence.archived")}
            </span>
          ) : null}
        </div>

        {props.timer.description ? (
          <>
            <div className="mt-0.5 hidden min-w-0 text-sm text-muted-foreground md:line-clamp-2 md:h-10 md:block">
              <span className="md:group-hover:hidden">{props.sub}</span>
              <span className="hidden md:group-hover:inline">{props.timer.description}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 min-w-0 text-sm text-muted-foreground md:hidden">
              <span>{props.sub}</span>
            </div>
          </>
        ) : (
          <div className="mt-0.5 line-clamp-2 min-w-0 text-sm text-muted-foreground md:h-10">
            <span>{props.sub}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function TimerCardMobileActions(
  props: Readonly<{
    isArchived: boolean
    isPinned: boolean
    isFollowed: boolean
    notificationsEnabled: boolean
    canMove?: boolean
    onTogglePin: () => void
    onToggleNotification: () => void
    onOpenShare: () => void
    onOpenFocus: () => void
    onOpenEdit: () => void
    onOpenMove?: () => void
    onUnfollow: () => void
    onDuplicate: () => void
    onToggleArchive: () => void
    onDelete: () => void
  }>,
) {
  return (
    <div data-timer-card-action="" className="absolute right-3 top-3 z-10 flex items-center gap-1 md:hidden">
      {props.isArchived ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`rounded-full p-1.5 ${timerActionClassName}`}
              aria-label={formatMessage(props.isPinned ? "timer.unpinAction" : "timer.pinAction")}
              aria-pressed={props.isPinned}
              onClick={(event) => {
                event.stopPropagation()
                props.onTogglePin()
              }}
            >
              {props.isPinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {formatMessage(props.isPinned ? "timer.unpin" : "timer.pin")}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              className={`rounded-full p-1.5 ${timerActionClassName}`}
              aria-label={formatMessage(props.isFollowed ? "timer.unfollowOrDuplicate" : "timer.edit")}
              disabled={props.isFollowed}
              onClick={(event) => {
                event.stopPropagation()
                if (!props.isFollowed) props.onOpenEdit()
              }}
            >
              {props.isFollowed ? <LockIcon className="size-4" /> : <PencilIcon className="size-4" />}
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className={props.isFollowed ? "max-w-[220px]" : undefined}>
          {formatMessage(props.isFollowed ? "timer.unfollowOrDuplicate" : "common.edit")}
        </TooltipContent>
      </Tooltip>
      <TimerFocusAction
        className={`rounded-full p-1.5 ${timerActionClassName}`}
        onOpen={props.onOpenFocus}
        stopPropagation
      />
      <TimerOverflowActions
        isArchived={props.isArchived}
        isFollowed={props.isFollowed}
        notificationsEnabled={props.notificationsEnabled}
        canMove={props.canMove}
        onOpenMove={props.onOpenMove}
        onToggleNotification={props.onToggleNotification}
        onOpenShare={props.onOpenShare}
        onUnfollow={props.onUnfollow}
        onDuplicate={props.onDuplicate}
        onToggleArchive={props.onToggleArchive}
        onDelete={props.onDelete}
        triggerClassName={`rounded-full p-1.5 ${timerActionClassName}`}
        onTriggerPointerDown={(event) => {
          event.stopPropagation()
        }}
        onTriggerClick={(event) => {
          event.stopPropagation()
        }}
      />
    </div>
  )
}

function TimerPinAction(
  props: Readonly<{
    isArchived: boolean
    isPinned: boolean
    onTogglePin: () => void
  }>,
) {
  if (props.isArchived) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={timerActionClassName}
          aria-label={formatMessage(props.isPinned ? "timer.unpinAction" : "timer.pinAction")}
          aria-pressed={props.isPinned}
          onClick={props.onTogglePin}
        >
          {props.isPinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {formatMessage(props.isPinned ? "timer.unpin" : "timer.pin")}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerLockedEditAction() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <Button
            variant="ghost"
            size="icon-sm"
            className={timerActionClassName}
            aria-label={formatMessage("timer.edit")}
            disabled
          >
            <LockIcon className="size-4" />
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-[220px]">
        {formatMessage("timer.unfollowOrDuplicate")}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerEditAction(
  props: Readonly<{
    timer: Timer
    onEditSubmit: (timer: TimerFormSubmitValue) => void
  }>,
) {
  const [formOpen, setFormOpen] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(false)

  function handleFormOpenChange(nextOpen: boolean) {
    setFormOpen(nextOpen)
    if (nextOpen) setTooltipOpen(false)
  }

  return (
    <>
      <Tooltip
        open={!formOpen && tooltipOpen}
        onOpenChange={(nextOpen) => {
          setTooltipOpen(nextOpen && !formOpen)
        }}
      >
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={timerActionClassName}
            aria-label={formatMessage("timer.edit")}
            onClick={() => {
              setTooltipOpen(false)
              setFormOpen(true)
            }}
          >
            <PencilIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {formatMessage("common.edit")}
        </TooltipContent>
      </Tooltip>
      <TimerForm
        mode="edit"
        initial={props.timer}
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        onSubmit={props.onEditSubmit}
      />
    </>
  )
}

function TimerFocusDesktopAction(props: Readonly<{ onOpenFocus: () => void }>) {
  return <TimerFocusAction className={timerActionClassName} onOpen={props.onOpenFocus} />
}

function TimerOverflowActions(
  props: Readonly<{
    isArchived: boolean
    isFollowed: boolean
    notificationsEnabled: boolean
    canMove?: boolean
    onOpenMove?: () => void
    onToggleNotification: () => void
    onOpenShare: () => void
    onUnfollow: () => void
    onDuplicate: () => void
    onToggleArchive: () => void
    onDelete: () => void
    triggerClassName?: string
    onTriggerPointerDown?: (event: StopPropagationEvent) => void
    onTriggerClick?: (event: StopPropagationEvent) => void
  }>,
) {
  return (
    <DropdownMenu>
      <span className="inline-flex" onPointerDown={props.onTriggerPointerDown} onClick={props.onTriggerClick}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={props.triggerClassName ?? timerActionClassName}
            aria-label={formatMessage("timer.actions.openMenu")}
          >
            <EllipsisVerticalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <DropdownMenuItem onSelect={() => props.onToggleNotification()}>
          {formatMessage(props.notificationsEnabled ? "notifications.disableMenu" : "notifications.enableMenu")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onToggleArchive()}>
          {formatMessage(props.isArchived ? "common.restore" : "common.archive")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onOpenShare()}>{formatMessage("common.share")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onDuplicate()}>{formatMessage("common.duplicate")}</DropdownMenuItem>
        {props.canMove && props.onOpenMove ? (
          <DropdownMenuItem onSelect={() => props.onOpenMove?.()}>
            {formatMessage("timer.move.action")}
          </DropdownMenuItem>
        ) : null}
        {props.isFollowed ? (
          <DropdownMenuItem onSelect={() => props.onUnfollow()}>{formatMessage("timer.unfollow")}</DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => props.onDelete()}>
          {formatMessage("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TimerCardDesktopActions(
  props: Readonly<{
    timer: Timer
    isArchived: boolean
    isPinned: boolean
    isFollowed: boolean
    notificationsEnabled: boolean
    canMove?: boolean
    onTogglePin: () => void
    onToggleNotification: () => void
    onOpenShare: () => void
    onOpenFocus: () => void
    onOpenMove?: () => void
    onEditSubmit: (timer: TimerFormSubmitValue) => void
    onUnfollow: () => void
    onDuplicate: () => void
    onToggleArchive: () => void
    onDelete: () => void
  }>,
) {
  return (
    <div className="hidden shrink-0 items-center gap-1 md:flex">
      <TimerPinAction isArchived={props.isArchived} isPinned={props.isPinned} onTogglePin={props.onTogglePin} />
      {props.isFollowed ? (
        <TimerLockedEditAction />
      ) : (
        <TimerEditAction timer={props.timer} onEditSubmit={props.onEditSubmit} />
      )}
      <TimerFocusDesktopAction onOpenFocus={props.onOpenFocus} />
      <TimerOverflowActions
        isArchived={props.isArchived}
        isFollowed={props.isFollowed}
        notificationsEnabled={props.notificationsEnabled}
        canMove={props.canMove}
        onOpenMove={props.onOpenMove}
        onToggleNotification={props.onToggleNotification}
        onOpenShare={props.onOpenShare}
        onUnfollow={props.onUnfollow}
        onDuplicate={props.onDuplicate}
        onToggleArchive={props.onToggleArchive}
        onDelete={props.onDelete}
      />
    </div>
  )
}

export function MoveToProjectDialog(
  props: Readonly<{
    open: boolean
    onOpenChange: (open: boolean) => void
    projects: { id: string; name: string }[]
    onMove: (projectId: string) => void
  }>,
) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{formatMessage("timer.move.title")}</DialogTitle>
          <DialogDescription>{formatMessage("timer.move.description")}</DialogDescription>
        </DialogHeader>
        {props.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">{formatMessage("timer.move.empty")}</p>
        ) : (
          <div className="grid gap-1">
            {props.projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                onClick={() => props.onMove(project.id)}
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{project.name}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function TimerShareDialog(
  props: Readonly<{
    open: boolean
    onOpenChange: (open: boolean) => void
    shareUrl: string
    shareLoading: boolean
    hasSharedMarker: boolean
    timerLabel: string
    onCreateAndCopy: () => void
  }>,
) {
  const [tab, setTab] = useState<"link" | "embed">("link")
  let actionLabel = formatMessage("share.createLink")
  if (props.shareUrl) actionLabel = formatMessage("share.copyLinkAction")
  else if (props.hasSharedMarker) actionLabel = formatMessage("share.restoreLink")

  const parsed = props.shareUrl ? parseShareUrl(props.shareUrl) : null
  const showTabs = Boolean(parsed)
  const activeTab = showTabs ? tab : "link"

  function handleOpenChange(open: boolean) {
    if (open) setTab("link")
    props.onOpenChange(open)
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(activeTab === "embed" && "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{formatMessage("share.timerDialog.title")}</DialogTitle>
          <DialogDescription>
            {formatMessage(activeTab === "embed" ? "share.embed.description" : "share.timerDialog.description")}
          </DialogDescription>
        </DialogHeader>

        {showTabs && (
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["link", "embed"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activeTab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {formatMessage(value === "link" ? "share.timerDialog.linkTab" : "share.embed.tab")}
              </button>
            ))}
          </div>
        )}

        {activeTab === "embed" && parsed ? (
          <EmbedSnippetControls origin={parsed.origin} shareId={parsed.shareId} timerLabel={props.timerLabel} />
        ) : (
          <>
            <div className="grid gap-3">{props.shareUrl ? <Input value={props.shareUrl} readOnly /> : null}</div>
            <DialogFooter>
              <Button type="button" loading={props.shareLoading} onClick={props.onCreateAndCopy}>
                {actionLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function TimerImageAttribution(props: Readonly<{ timer: Timer }>) {
  if (!props.timer.image) return null

  return (
    <div className="px-2 pt-1 text-[10px] text-muted-foreground/50">
      {formatMessage("unsplash.attribution")}{" "}
      <a
        href={`${props.timer.image.authorUrl}?utm_source=tickward&utm_medium=referral`}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-muted-foreground"
      >
        {props.timer.image.authorName}
      </a>
      {" / "}
      <a
        href="https://unsplash.com/?utm_source=tickward&utm_medium=referral"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-muted-foreground"
      >
        Unsplash
      </a>
    </div>
  )
}

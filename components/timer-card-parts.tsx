import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BellIcon,
  BellOffIcon,
  CopyIcon,
  Link2OffIcon,
  LockIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RepeatIcon,
  Share2Icon,
  TrashIcon,
} from "lucide-react"
import Image from "next/image"
import { useState, type ReactNode } from "react"

import { CountdownDisplay } from "@/components/countdown-display"
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
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage } from "@/lib/i18n/messages"
import type { Timer } from "@/lib/types"
import { formatTargetInTimeZone } from "@/lib/utils"

type RecurrenceHistory = {
  count: number
  last: string | null
}

const timerActionClassName = "text-muted-foreground/75 hover:text-muted-foreground"

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
  }>,
) {
  return (
    <div
      className={[
        "group relative min-w-0 w-full md:rounded-2xl md:border bg-card p-5 transition-colors",
        props.isPinned
          ? "border-l-2 border-l-primary/45 bg-primary/[0.025] md:border-primary/15 dark:bg-primary/[0.04]"
          : "md:border-border",
        props.isArchived ? "bg-muted/30" : "",
      ].join(" ")}
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
    notificationsEnabled: boolean
    onTogglePin: () => void
    onToggleNotification: () => void
    onOpenShare: () => void
  }>,
) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 md:hidden">
      {props.isArchived ? null : (
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
      )}
      <button
        type="button"
        className={`rounded-full p-1.5 ${timerActionClassName}`}
        aria-label={formatMessage(
          props.notificationsEnabled ? "notifications.disableTimer" : "notifications.enableTimer",
        )}
        aria-pressed={props.notificationsEnabled}
        onClick={(event) => {
          event.stopPropagation()
          props.onToggleNotification()
        }}
      >
        {props.notificationsEnabled ? <BellIcon className="size-4" /> : <BellOffIcon className="size-4" />}
      </button>
      <button
        type="button"
        className={`rounded-full p-1.5 ${timerActionClassName}`}
        aria-label={formatMessage("share.timerDialog.title")}
        onClick={(event) => {
          event.stopPropagation()
          props.onOpenShare()
        }}
      >
        <Share2Icon className="size-4" />
      </button>
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

function TimerNotificationAction(
  props: Readonly<{
    notificationsEnabled: boolean
    onToggleNotification: () => void
  }>,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={timerActionClassName}
          aria-label={formatMessage(
            props.notificationsEnabled ? "notifications.disableTimer" : "notifications.enableTimer",
          )}
          aria-pressed={props.notificationsEnabled}
          onClick={props.onToggleNotification}
        >
          {props.notificationsEnabled ? <BellIcon className="size-4" /> : <BellOffIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {formatMessage(props.notificationsEnabled ? "notifications.on" : "notifications.notifyMe")}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerShareAction(props: Readonly<{ onOpenShare: () => void }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={timerActionClassName}
          aria-label={formatMessage("share.timerDialog.title")}
          onClick={props.onOpenShare}
        >
          <Share2Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {formatMessage("common.share")}
      </TooltipContent>
    </Tooltip>
  )
}

function FollowedTimerActions(props: Readonly<{ onUnfollow: () => void }>) {
  return (
    <>
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={timerActionClassName}
            aria-label={formatMessage("timer.unfollowAction")}
            onClick={props.onUnfollow}
          >
            <Link2OffIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {formatMessage("timer.unfollow")}
        </TooltipContent>
      </Tooltip>
    </>
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

function TimerDuplicateAction(props: Readonly<{ isFollowed: boolean; onDuplicate: () => void }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={timerActionClassName}
          aria-label={formatMessage("timer.duplicate")}
          onClick={props.onDuplicate}
        >
          <CopyIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {formatMessage(props.isFollowed ? "timer.addCopy" : "common.duplicate")}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerArchiveAction(
  props: Readonly<{
    isArchived: boolean
    onToggleArchive: () => void
  }>,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={timerActionClassName}
          aria-label={formatMessage(props.isArchived ? "timer.restore" : "timer.archive")}
          onClick={props.onToggleArchive}
        >
          {props.isArchived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {formatMessage(props.isArchived ? "common.restore" : "common.archive")}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerDeleteAction(props: Readonly<{ onDelete: () => void }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={timerActionClassName}
          aria-label={formatMessage("timer.delete")}
          onClick={props.onDelete}
        >
          <TrashIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {formatMessage("common.delete")}
      </TooltipContent>
    </Tooltip>
  )
}

export function TimerCardDesktopActions(
  props: Readonly<{
    timer: Timer
    isArchived: boolean
    isPinned: boolean
    isFollowed: boolean
    notificationsEnabled: boolean
    onTogglePin: () => void
    onToggleNotification: () => void
    onOpenShare: () => void
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
      <TimerNotificationAction
        notificationsEnabled={props.notificationsEnabled}
        onToggleNotification={props.onToggleNotification}
      />
      <TimerShareAction onOpenShare={props.onOpenShare} />
      {props.isFollowed ? (
        <FollowedTimerActions onUnfollow={props.onUnfollow} />
      ) : (
        <TimerEditAction timer={props.timer} onEditSubmit={props.onEditSubmit} />
      )}

      <div className="flex items-center gap-1">
        <TimerDuplicateAction isFollowed={props.isFollowed} onDuplicate={props.onDuplicate} />
        <TimerArchiveAction isArchived={props.isArchived} onToggleArchive={props.onToggleArchive} />
        <TimerDeleteAction onDelete={props.onDelete} />
      </div>
    </div>
  )
}

export function TimerShareDialog(
  props: Readonly<{
    open: boolean
    onOpenChange: (open: boolean) => void
    shareUrl: string
    shareLoading: boolean
    hasSharedMarker: boolean
    onCreateAndCopy: () => void
  }>,
) {
  let actionLabel = formatMessage("share.createLink")
  if (props.shareUrl) actionLabel = formatMessage("share.copyLinkAction")
  else if (props.hasSharedMarker) actionLabel = formatMessage("share.restoreLink")

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{formatMessage("share.timerDialog.title")}</DialogTitle>
          <DialogDescription>{formatMessage("share.timerDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {props.shareUrl ? (
            <div className="grid gap-2">
              <Input value={props.shareUrl} readOnly />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" loading={props.shareLoading} onClick={props.onCreateAndCopy}>
            {actionLabel}
          </Button>
        </DialogFooter>
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

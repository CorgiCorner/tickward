"use client"

import { ArrowLeftIcon, EllipsisVerticalIcon, Maximize2Icon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"

import {
  canAnimate,
  MENU_MOTION_CLASSNAME,
  MOTION_MS,
  MOVE_EASING,
  PRESS_CLASSNAME,
  prefersReducedMotion,
} from "@/components/dashboard/motion"
import { useMilestoneMoment } from "@/components/dashboard/use-milestone-moment"
import { useViewCrossfade } from "@/components/dashboard/use-view-crossfade"
// Loaded with the detail view itself (which is loaded lazily), so Edit swaps to a form that is
// ready, without a suspended frame in the middle of the transition.
import { TimerForm } from "@/components/timer-form"
import { TimerDetailCounter } from "@/components/timer-detail/timer-detail-counter"
import { isCountUpTimer, milestoneReachedToday } from "@/components/timer-detail/timer-detail-model"
import {
  TimerDetailFacts,
  TimerDetailHeading,
  TimerDetailMilestones,
  TimerDetailProgress,
  TimerDetailReminders,
} from "@/components/timer-detail/timer-detail-sections"
import { useNow } from "@/components/use-now"
import { Button } from "@/components/ui/button"
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatMessage } from "@/lib/i18n/messages"
import type { TimerFormSubmitValue } from "@/lib/schemas/timer"
import type { Space, Timer } from "@/lib/types"
import { cn } from "@/lib/utils"


export type TimerDetailActions = {
  /** Opens the edit form. Leave it out for followed timers, which cannot be edited. */
  onEdit?: () => void
  onShare?: () => void
  /**
   * Opens focus mode. It opens over the detail view, which goes once it is covered, as one
   * transition; focus mode returns focus to `returnFocusTo` (the card) when it closes.
   */
  onFocus?: (returnFocusTo?: HTMLElement | null) => void
  /**
   * Saves an edit. With it, Edit replaces the detail content with the form inside the same
   * panel and returns to the detail view on Save or Back; without it Edit calls `onEdit`.
   */
  onEditSubmit?: (timer: TimerFormSubmitValue) => void
  /** Copies the public link; shown when the timer is shared. */
  onCopyShareLink?: () => void
  /** Items for the overflow menu (pin, archive, delete, ...), as DropdownMenuItem elements. */
  menuItems?: ReactNode
}

export type TimerDetailContentProps = TimerDetailActions & {
  timer: Timer
  space?: Space
  signedIn: boolean
  /** A fixed instant for stories and tests; the view ticks live without it. */
  nowMs?: number
}

export type TimerDetailDialogProps = TimerDetailContentProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The element the view grows from and returns focus to: the card's opener. */
  originRef?: RefObject<HTMLElement | null>
  /**
   * Where focus lands on open. "first" (keyboard) is the Back control with its ring;
   * "panel" (a click or tap) is the panel itself, so no ring shows until a key is used.
   */
  initialFocus?: "first" | "panel"
}

// Opens from the card it belongs to: the panel scales up from 0.97 around the
// card's centre with a fade (220 ms) and closes faster (160 ms). Reduced
// motion keeps only the fade.
const panelClassName = cn(
  "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none",
  "md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[calc(100dvh-4rem)] md:w-[640px] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-lg",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:duration-enter data-[state=open]:ease-move",
  "motion-reduce:data-[state=open]:zoom-in-100",
)
const contentClassName = cn(
  panelClassName,
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=closed]:duration-exit data-[state=closed]:ease-fade",
  "motion-reduce:data-[state=closed]:zoom-out-100",
)
// Handing over to focus mode: the panel stays as it is while focus mode fades in over
// it, and goes once it is covered.
const handoffContentClassName = cn(panelClassName, "data-[state=closed]:animate-out data-[state=closed]:duration-move")

const pressClassName = PRESS_CLASSNAME

function originFor(content: HTMLElement, origin: HTMLElement | null | undefined) {
  if (!origin?.isConnected) return null
  const from = origin.getBoundingClientRect()
  const to = content.getBoundingClientRect()
  if (from.width === 0 && from.height === 0) return null
  const x = from.left + from.width / 2 - to.left
  const y = from.top + from.height / 2 - to.top
  return `${Math.round(x)}px ${Math.round(y)}px`
}

function OverflowMenu(props: Readonly<{ items: ReactNode; size: "icon-sm" | "icon-lg" }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={props.size}
          className={cn("text-muted-foreground", pressClassName)}
          aria-label={formatMessage("timer.actions.openMenu")}
        >
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className={MENU_MOTION_CLASSNAME}>
        {props.items}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TimerDetailBody(props: Readonly<TimerDetailContentProps & { nowMs: number; onEditRules?: () => void }>) {
  const { nowMs, timer } = props
  const countsUp = isCountUpTimer(timer)
  // The milestone moment, once per timer and value in the detail view: the count rolls in
  // and the badge arrives.
  const moment = useMilestoneMoment("detail", timer.id, countsUp ? milestoneReachedToday(timer, nowMs) : null)

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-5 md:gap-6 md:px-7 md:pb-7 md:pt-7">
      <TimerDetailHeading timer={timer} space={props.space} nowMs={nowMs} momentPhase={moment.phase} />
      <div className="mt-2 flex flex-col gap-6 md:mt-2">
        <TimerDetailCounter
          timer={timer}
          nowMs={nowMs}
          rollPhase={moment.rolling ? moment.phase : undefined}
        />
        <TimerDetailProgress timer={timer} space={props.space} nowMs={nowMs} />
      </div>
      {countsUp ? (
        <TimerDetailMilestones timer={timer} nowMs={nowMs} onEditRules={props.onEditRules} />
      ) : (
        <TimerDetailReminders timer={timer} nowMs={nowMs} signedIn={props.signedIn} />
      )}
      <TimerDetailFacts
        timer={timer}
        space={props.space}
        signedIn={props.signedIn}
        onCopyShareLink={props.onCopyShareLink}
      />
    </div>
  )
}

function LiveTimerDetailBody(props: Readonly<TimerDetailContentProps & { onEditRules?: () => void }>) {
  const nowMs = useNow()
  return <TimerDetailBody {...props} nowMs={nowMs} />
}

/** Edit, replacing the detail content: a way back, then the form in the same panel. */
function TimerDetailEdit(
  props: Readonly<{
    timer: Timer
    backRef: RefObject<HTMLButtonElement | null>
    onBack: (event?: { detail: number }) => void
    onSubmit: (timer: TimerFormSubmitValue) => void
  }>,
) {
  const { backRef, onBack, onSubmit, timer } = props
  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 md:px-4">
        <Button
          ref={backRef}
          type="button"
          variant="ghost"
          size="lg"
          data-testid="timer-detail-edit-back"
          className={cn("-ml-1 min-w-0 gap-1.5 px-2 has-[>svg]:px-2 md:h-8 md:text-muted-foreground", pressClassName)}
          onClick={onBack}
        >
          <ArrowLeftIcon aria-hidden="true" />
          <span className="truncate">{timer.label}</span>
        </Button>
      </header>
      <TimerForm
        surface="inline"
        mode="edit"
        initial={timer}
        open
        onOpenChange={(open) => {
          if (!open) onBack()
        }}
        onSubmit={onSubmit}
      />
    </>
  )
}

/** The first of `elements` on screen (phones and desktops each show one Edit button). */
function visibleElement(...elements: Array<HTMLElement | null>) {
  const connected = elements.filter((element): element is HTMLElement => Boolean(element?.isConnected))
  return connected.find((element) => element.getClientRects().length > 0) ?? connected[0] ?? null
}

/**
 * The panel keeps one continuous size change when its content is replaced: it eases from the
 * height it had to the height of the new content, around its centre. Phones show it full
 * screen, where the height does not change.
 */
function usePanelHeightFollow<T>(panel: RefObject<HTMLElement | null>, requested: T, shown: T) {
  const before = useRef<number | null>(null)
  useLayoutEffect(() => {
    before.current = panel.current?.getBoundingClientRect().height ?? null
  }, [panel, requested])
  useLayoutEffect(() => {
    const element = panel.current
    const from = before.current
    if (!element || from === null || !canAnimate(element) || prefersReducedMotion()) return
    const to = element.getBoundingClientRect().height
    if (Math.abs(to - from) < 1) return
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: MOTION_MS.enter,
      easing: MOVE_EASING,
    })
    return () => animation.cancel()
  }, [panel, shown])
}

/**
 * The timer detail view. Phones get a full screen with a back control and Edit
 * and Share at the bottom; from `md` up it is a centred panel with named
 * actions in its header. Dialog semantics, focus trap and Escape come from the
 * dialog primitive; focus returns to `originRef` on close. Edit replaces the
 * content in place and Focus hands over to focus mode as one transition.
 */
export function TimerDetailDialog(props: Readonly<TimerDetailDialogProps>) {
  const { onOpenChange, open, originRef } = props
  const [view, setView] = useState<"detail" | "edit">("detail")
  const [handoff, setHandoff] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const swapRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const editBackRef = useRef<HTMLButtonElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const editFooterButtonRef = useRef<HTMLButtonElement>(null)
  const shown = useViewCrossfade(view, swapRef)
  const lastShown = useRef(shown)
  // Whether the last swap was asked for with a pointer: then the moved focus shows no ring.
  const swapByPointer = useRef(false)
  const canEditInPlace = Boolean(props.onEditSubmit)
  usePanelHeightFollow(panelRef, view, shown)

  const contentRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node
      if (!node) return
      const origin = originFor(node, originRef?.current)
      if (origin) node.style.transformOrigin = origin
    },
    [originRef],
  )

  // Warm focus mode while the detail view is open, so Focus never waits for its code in
  // the middle of the transition.
  const canFocus = Boolean(props.onFocus)
  useEffect(() => {
    if (!open) return
    if (canFocus) void import("@/components/timer-focus-mode")
  }, [canFocus, open])

  // After a replace, focus goes to the new content's way back, or back to Edit.
  useEffect(() => {
    if (lastShown.current === shown) return
    lastShown.current = shown
    const target =
      shown === "edit" ? editBackRef.current : visibleElement(editButtonRef.current, editFooterButtonRef.current)
    target?.focus({ preventScroll: true, focusVisible: !swapByPointer.current })
  }, [shown])

  function close() {
    onOpenChange(false)
  }

  function openFocus() {
    // Focus mode opens over the panel right away; the panel holds still until
    // it is covered, then goes. Focus mode returns focus to the card.
    setHandoff(true)
    props.onFocus?.(originRef?.current ?? null)
    onOpenChange(false)
  }

  function edit(event?: { detail: number }) {
    swapByPointer.current = (event?.detail ?? 0) > 0
    if (canEditInPlace) setView("edit")
    else props.onEdit?.()
  }

  function backToDetail(event?: { detail: number }) {
    swapByPointer.current = (event?.detail ?? 0) > 0
    setView("detail")
  }

  function submitEdit(timer: TimerFormSubmitValue) {
    props.onEditSubmit?.(timer)
  }

  const showFocus = Boolean(props.onFocus)
  const canEdit = Boolean(props.onEdit || props.onEditSubmit)
  const body =
    props.nowMs === undefined ? (
      <LiveTimerDetailBody {...props} onEditRules={canEdit ? edit : undefined} />
    ) : (
      <TimerDetailBody {...props} nowMs={props.nowMs} onEditRules={canEdit ? edit : undefined} />
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="hidden duration-enter data-[state=closed]:duration-exit md:block" />
        <DialogPrimitive.Content
          ref={contentRef}
          data-testid="timer-detail"
          data-view={shown}
          data-handoff={handoff || undefined}
          className={handoff ? handoffContentClassName : contentClassName}
          onOpenAutoFocus={(event) => {
            if (props.initialFocus !== "panel") return
            // Opened by a click or tap: focus moves into the dialog, onto the panel
            // itself, so no focus ring shows until the keyboard is used.
            event.preventDefault()
            panelRef.current?.focus({ preventScroll: true })
          }}
          onEscapeKeyDown={(event) => {
            // In the edit form, Escape goes back to the detail view first.
            if (view !== "edit") return
            event.preventDefault()
            backToDetail()
          }}
          onCloseAutoFocus={(event) => {
            setView("detail")
            if (handoff) {
              // Focus mode has focus now and gives it back to the card itself.
              event.preventDefault()
              setHandoff(false)
              return
            }
            const origin = originRef?.current
            if (origin?.isConnected) {
              event.preventDefault()
              origin.focus()
            }
          }}
        >
          <div ref={swapRef} data-slot="timer-detail-content" className="flex min-h-0 flex-1 flex-col">
            {shown === "edit" ? (
              <TimerDetailEdit
                timer={props.timer}
                backRef={editBackRef}
                onBack={backToDetail}
                onSubmit={submitEdit}
              />
            ) : (
              <>
                <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5 md:px-4">
                  <Button
                    ref={backRef}
                    type="button"
                    variant="ghost"
                    size="lg"
                    className={cn("-ml-1 gap-1.5 px-2 has-[>svg]:px-2 md:h-8 md:text-muted-foreground", pressClassName)}
                    onClick={close}
                  >
                    <ArrowLeftIcon aria-hidden="true" />
                    {formatMessage("timerDetail.back")}
                  </Button>

                  <div className="hidden items-center gap-1.5 md:flex">
                    {canEdit ? (
                      <Button
                        ref={editButtonRef}
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("text-xs", pressClassName)}
                        onClick={edit}
                      >
                        {formatMessage("common.edit")}
                      </Button>
                    ) : null}
                    {props.onShare ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("text-xs", pressClassName)}
                        onClick={props.onShare}
                      >
                        {formatMessage("common.share")}
                      </Button>
                    ) : null}
                    {showFocus ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("text-xs", pressClassName)}
                        onClick={openFocus}
                      >
                        <Maximize2Icon aria-hidden="true" className="size-3.5" />
                        {formatMessage("timerDetail.focus")}
                      </Button>
                    ) : null}
                    {props.menuItems ? <OverflowMenu items={props.menuItems} size="icon-sm" /> : null}
                  </div>

                  <div className="flex items-center md:hidden">
                    {showFocus ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        className={cn("text-muted-foreground", pressClassName)}
                        aria-label={formatMessage("timer.focus.enter")}
                        onClick={openFocus}
                      >
                        <Maximize2Icon className="size-[18px]" />
                      </Button>
                    ) : null}
                    {props.menuItems ? <OverflowMenu items={props.menuItems} size="icon-lg" /> : null}
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>

                {canEdit || props.onShare ? (
                  <footer className="grid shrink-0 grid-flow-col auto-cols-fr gap-2 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:hidden">
                    {canEdit ? (
                      <Button
                        ref={editFooterButtonRef}
                        type="button"
                        variant="outline"
                        size="lg"
                        className={pressClassName}
                        onClick={edit}
                      >
                        {formatMessage("common.edit")}
                      </Button>
                    ) : null}
                    {props.onShare ? (
                      <Button type="button" size="lg" className={pressClassName} onClick={props.onShare}>
                        {formatMessage("common.share")}
                      </Button>
                    ) : null}
                  </footer>
                ) : null}
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

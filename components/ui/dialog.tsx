"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { formatMessage } from "@/lib/i18n/messages"

function Dialog({ ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Root>>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Trigger>>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Portal>>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Close>>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Overlay>>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  )
}

// Centered card on every breakpoint (default dialog behavior).
const dialogCardClassName =
  "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border p-6 shadow-lg duration-200 outline-none sm:max-w-lg"

// Bottom-anchored sheet on phones, centered card from `sm` up. The mobile values
// are the unprefixed base; `sm:` reverts each one to the centered-card layout.
const dialogSheetClassName = cn(
  "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed z-50 grid gap-4 overflow-y-auto border shadow-lg duration-200 outline-none",
  "inset-x-0 bottom-0 top-auto w-full max-w-full max-h-[88dvh] translate-x-0 translate-y-0 rounded-t-2xl border-x-0 border-b-0 p-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
  "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-w-lg sm:max-h-[calc(100dvh-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border-x sm:border-b sm:pt-6 sm:pb-6 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
)

function DialogContent({
  className,
  children,
  showCloseButton = true,
  sheetOnMobile = false,
  style,
  ...props
}: Readonly<
  React.ComponentProps<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean
    sheetOnMobile?: boolean
  }
>) {
  // Touch swipe-to-dismiss for the mobile sheet. We use plain touch events (no
  // pointer capture) and drive the close through a hidden Close button, which
  // keeps the body scrollable and avoids tearing down a captured pointer.
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const startYRef = React.useRef<number | null>(null)
  const [dragY, setDragY] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)

  function handleTouchStart(event: React.TouchEvent) {
    startYRef.current = event.touches[0]?.clientY ?? null
    setDragging(true)
  }
  function handleTouchMove(event: React.TouchEvent) {
    if (startYRef.current === null) return
    const delta = (event.touches[0]?.clientY ?? startYRef.current) - startYRef.current
    setDragY(delta > 0 ? delta : 0)
  }
  function handleTouchEnd() {
    setDragging(false)
    if (dragY > 110) closeRef.current?.click()
    setDragY(0)
    startYRef.current = null
  }

  const sheetStyle =
    sheetOnMobile && dragY > 0
      ? { transform: `translateY(${dragY}px)`, transition: dragging ? "none" : undefined }
      : style

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(sheetOnMobile ? dialogSheetClassName : dialogCardClassName, className)}
        style={sheetStyle}
        {...props}
      >
        {/* Drag handle for the mobile sheet — swipe it down to dismiss. The
            dialog still closes via the X button, overlay tap, or Escape. */}
        {sheetOnMobile ? (
          <div
            data-slot="dialog-sheet-handle"
            aria-hidden
            className="-mt-1 mb-1 flex h-5 w-full shrink-0 cursor-grab touch-none items-center justify-center sm:hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          </div>
        ) : null}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">{formatMessage("common.close")}</span>
          </DialogPrimitive.Close>
        )}
        {sheetOnMobile ? <DialogPrimitive.Close ref={closeRef} aria-hidden tabIndex={-1} className="hidden" /> : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: Readonly<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: Readonly<
  React.ComponentProps<"div"> & {
    showCloseButton?: boolean
  }
>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{formatMessage("common.close")}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Title>>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: Readonly<React.ComponentProps<typeof DialogPrimitive.Description>>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

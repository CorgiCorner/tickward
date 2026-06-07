"use client"

import { ShareIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { formatMessage } from "@/lib/i18n/messages"

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in globalThis)
}

function isStandalone(): boolean {
  if (globalThis.window === undefined) return false
  return (
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
    globalThis.matchMedia("(display-mode: standalone)").matches
  )
}

const DISMISS_KEY = "iosPwaPromptDismissed"

export function IosPwaPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setShow(isIosSafari() && !isStandalone() && !localStorage.getItem(DISMISS_KEY))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!show) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1")
    setShow(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 safe-bottom p-4">
      <div className="mx-auto flex max-w-[640px] items-start gap-3 rounded-2xl border bg-card p-4 shadow-lg">
        <ShareIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{formatMessage("ios.install.title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMessage("ios.install.description", { action: formatMessage("ios.install.homeScreen") })}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
          onClick={dismiss}
          aria-label={formatMessage("common.dismiss")}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}

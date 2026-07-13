"use client"

import { useId, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  DEFAULT_EMBED_PARAMS,
  EMBED_DONE_TEXT_MAX_LENGTH,
  EMBED_END_MODES,
  EMBED_LAYOUTS,
  EMBED_RECOMMENDED_SIZE,
  EMBED_THEMES,
  embedQueryString,
  parseEmbedParams,
  type EmbedEndMode,
  type EmbedLayout,
  type EmbedTheme,
} from "@/lib/embed-params"
import { formatMessage } from "@/lib/i18n/messages"
import { isRoutableShareId } from "@/lib/share-model"

const fieldClassName =
  "border-input dark:bg-input/30 w-full min-w-0 rounded-md border bg-transparent shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

function currentOrigin(): string | null {
  try {
    return globalThis.location.origin
  } catch {
    return null
  }
}

export function normalizeEmbedOrigin(origin: string, expectedOrigin = currentOrigin()): string | null {
  try {
    const candidate = new URL(origin)
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return null
    if (candidate.username || candidate.password) return null

    if (expectedOrigin) {
      const expected = new URL(expectedOrigin)
      if (expected.protocol !== "http:" && expected.protocol !== "https:") return null
      if (candidate.origin !== expected.origin) return null
    }

    return candidate.origin
  } catch {
    return null
  }
}

export function parseShareUrl(shareUrl: string): { origin: string; shareId: string } | null {
  try {
    const url = new URL(shareUrl)
    const origin = normalizeEmbedOrigin(url.origin)
    const pathMatch = /^\/share\/([^/]+)\/?$/.exec(url.pathname)
    const shareId = pathMatch?.[1]
    return origin && shareId && isRoutableShareId(shareId) ? { origin, shareId } : null
  } catch {
    return null
  }
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

// Layout/theme picker plus a copyable iframe snippet for an existing share.
// Used by the timer share dialog (owner side) and the share page (anyone
// with the link - the token is already the public capability).
export function EmbedSnippetControls(props: Readonly<{ origin: string; shareId: string; timerLabel: string }>) {
  // Keys used via template literal: share.embed.layout.compact share.embed.layout.horizontal
  // share.embed.layout.minimal share.embed.layout.square share.embed.layout.text
  // share.embed.end.auto share.embed.end.countup share.embed.end.message
  // share.embed.theme.auto share.embed.theme.dark share.embed.theme.light
  const [layout, setLayout] = useState<EmbedLayout>(DEFAULT_EMBED_PARAMS.layout)
  const [theme, setTheme] = useState<EmbedTheme>(DEFAULT_EMBED_PARAMS.theme)
  const [endMode, setEndMode] = useState<EmbedEndMode>(DEFAULT_EMBED_PARAMS.endMode)
  const [doneText, setDoneText] = useState("")
  const [loadedPreviewSrc, setLoadedPreviewSrc] = useState<string | null>(null)
  const layoutSelectId = useId()
  const themeSelectId = useId()
  const endSelectId = useId()
  const doneTextId = useId()

  const params = parseEmbedParams({
    done: endMode === "countup" ? undefined : doneText,
    end: endMode,
    layout,
    theme,
  })
  const size = EMBED_RECOMMENDED_SIZE[params.layout]
  const origin = normalizeEmbedOrigin(props.origin)
  const src =
    origin && isRoutableShareId(props.shareId)
      ? new URL(`/embed/${encodeURIComponent(props.shareId)}${embedQueryString(params)}`, origin).toString()
      : null
  const timerName = props.timerLabel || formatMessage("app.title.sharedTimer")
  const iframeTitle = formatMessage("share.embed.iframeTitle", { timer: timerName })
  const previewTitle = formatMessage("share.embed.previewTitle", { timer: timerName })
  const previewStyle =
    layout === "square"
      ? { width: size.width, minWidth: size.minWidth, maxWidth: "100%", aspectRatio: "1 / 1" }
      : { width: size.width, minWidth: size.minWidth, maxWidth: "100%", height: size.height }
  const title = ` title="${escapeAttribute(iframeTitle)}"`
  const snippet = src
    ? `<iframe src="${escapeAttribute(src)}" width="${size.width}" height="${size.height}" style="border:0" loading="lazy"${title}></iframe>`
    : ""
  const previewLoading = src !== null && loadedPreviewSrc !== src

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet)
    toast.success(formatMessage("share.embed.copied"))
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={layoutSelectId}>{formatMessage("share.embed.layout")}</Label>
          <select
            id={layoutSelectId}
            value={layout}
            onChange={(event) => setLayout(event.target.value as EmbedLayout)}
            className={`${fieldClassName} h-9 px-3 py-1 text-base md:text-sm`}
          >
            {EMBED_LAYOUTS.map((value) => (
              <option key={value} value={value}>
                {formatMessage(`share.embed.layout.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={themeSelectId}>{formatMessage("share.embed.theme")}</Label>
          <select
            id={themeSelectId}
            value={theme}
            onChange={(event) => setTheme(event.target.value as EmbedTheme)}
            className={`${fieldClassName} h-9 px-3 py-1 text-base md:text-sm`}
          >
            {EMBED_THEMES.map((value) => (
              <option key={value} value={value}>
                {formatMessage(`share.embed.theme.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={endSelectId}>{formatMessage("share.embed.end")}</Label>
          <select
            id={endSelectId}
            value={endMode}
            onChange={(event) => setEndMode(event.target.value as EmbedEndMode)}
            className={`${fieldClassName} h-9 px-3 py-1 text-base md:text-sm`}
          >
            {EMBED_END_MODES.map((value) => (
              <option key={value} value={value}>
                {formatMessage(`share.embed.end.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={doneTextId}>{formatMessage("share.embed.doneText")}</Label>
          <input
            id={doneTextId}
            value={doneText}
            onChange={(event) => setDoneText(event.target.value)}
            disabled={endMode === "countup"}
            maxLength={EMBED_DONE_TEXT_MAX_LENGTH}
            className={`${fieldClassName} h-9 px-3 py-1 text-base disabled:opacity-50 md:text-sm`}
          />
        </div>
      </div>

      {src && (
        <div className="grid gap-1.5">
          <div className="text-sm font-medium">{formatMessage("share.embed.preview")}</div>
          <div className="max-w-full overflow-x-auto rounded-lg border bg-muted/30 p-3" aria-busy={previewLoading}>
            <div className="relative mx-auto overflow-hidden rounded-md bg-background" style={previewStyle}>
              {previewLoading && (
                <output className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-xs text-muted-foreground">
                  {formatMessage("share.embed.previewLoading")}
                </output>
              )}
              <iframe
                key={src}
                src={src}
                title={previewTitle}
                loading="eager"
                onLoad={() => setLoadedPreviewSrc(src)}
                className="block h-full w-full"
                style={{ border: 0 }}
              />
            </div>
          </div>
        </div>
      )}

      <textarea
        value={snippet}
        readOnly
        rows={3}
        aria-label={formatMessage("share.embed.snippet")}
        onFocus={(event) => event.currentTarget.select()}
        className={`${fieldClassName} resize-none px-3 py-2 font-mono text-xs`}
      />

      <Button type="button" variant="outline" size="sm" disabled={!src} onClick={() => void copySnippet()}>
        {formatMessage("share.embed.copy")}
      </Button>
    </div>
  )
}

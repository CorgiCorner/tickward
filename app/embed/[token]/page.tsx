import type { Metadata } from "next"

import { EmbedTimer, EmbedUnavailableCard } from "@/components/embed-timer"
import { getEmbedAttribution } from "@/lib/embed-attribution"
import { parseEmbedParams, parseHexColor } from "@/lib/embed-params"
import { formatMessage } from "@/lib/i18n/messages"
import { noIndexRobots } from "@/lib/seo-metadata"
import { isRoutableShareId } from "@/lib/share-model"
import { resolveTimerShare } from "@/lib/share-service.server"
import { cn } from "@/lib/utils"

export const runtime = "nodejs"

// Anonymous, cookie-free embed surface. A timer is embeddable iff it has an
// active share; revoking the share kills the embed. Invalid/revoked tokens
// render a neutral card with HTTP 200 - never an error page inside someone
// else's site.

export const metadata: Metadata = {
  title: formatMessage("app.title.sharedTimer"),
  robots: { ...noIndexRobots, nocache: true },
}

type PageProps = Readonly<{
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}>

export default async function EmbedPage(props: PageProps) {
  const { token } = await props.params
  const embed = parseEmbedParams(await props.searchParams)
  const resolved = isRoutableShareId(token) ? await resolveTimerShare(token) : null
  const attribution = getEmbedAttribution()

  const themeClass = embed.theme === "auto" ? undefined : embed.theme
  const transparent = embed.bg === "transparent"
  const customBg = embed.bg && !transparent ? embed.bg : undefined
  // System font stacks by design (payload budget: webfonts never load on
  // the embed surface; the plan forbids loading fonts from a param anyway).
  const fontFamily =
    embed.font === "mono"
      ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
      : "system-ui, -apple-system, 'Segoe UI', sans-serif"

  return (
    <div
      className={cn(
        "flex min-h-dvh w-full items-center justify-center text-foreground",
        themeClass,
        !embed.bg && "bg-background",
      )}
      style={{
        fontFamily,
        ...(customBg ? { backgroundColor: customBg } : {}),
        ...(transparent ? { backgroundColor: "transparent" } : {}),
        ...(embed.scale !== 1 ? { zoom: embed.scale } : {}),
      }}
    >
      {transparent && (
        // The iframe only shows the host page through when the whole
        // document is transparent, not just this wrapper.
        <style>{"html, body { background: transparent !important; }"}</style>
      )}
      {resolved ? (
        <EmbedTimer
          label={resolved.timer.label}
          targetDateIsoUtc={resolved.timer.targetDate}
          timezone={resolved.timer.timezone}
          layout={embed.layout}
          // Timer color acts as the default accent (contract open question 5).
          accent={embed.accent ?? parseHexColor(resolved.timer.color)}
          labels={embed.labels}
          showTarget={embed.showTarget}
          transparent={transparent}
          attribution={attribution}
        />
      ) : (
        <EmbedUnavailableCard attribution={attribution} layout={embed.layout} />
      )}
    </div>
  )
}

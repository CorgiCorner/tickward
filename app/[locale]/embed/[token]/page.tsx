import type { Metadata } from "next"

import { EmbedTimer, EmbedUnavailableCard } from "@/components/embed-timer"
import { getEmbedAttribution } from "@/lib/embed-attribution"
import { parseEmbedParams, parseHexColor } from "@/lib/embed-params"
import { formatMessage } from "@/lib/i18n/messages"
import { noIndexRobots } from "@/lib/seo-metadata"
import { isRoutableShareId } from "@/lib/share-model"
import { resolveTimerShare } from "@/lib/share-service.server"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"

export const runtime = "nodejs"

// Anonymous, cookie-free embed surface. A timer is embeddable iff it has an
// active share; revoking the share kills the embed. Invalid/revoked tokens
// render a neutral card with HTTP 200 - never an error page inside someone
// else's site.

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  return {
    title: formatMessage("app.title.sharedTimer", {}, locale),
    robots: { ...noIndexRobots, nocache: true },
  }
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
  const cardBackground = embed.bg && !transparent ? embed.bg : null
  // System font stacks by design (payload budget: webfonts never load on
  // the embed surface; the plan forbids loading fonts from a param anyway).
  const fontFamily =
    embed.font === "mono"
      ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
      : "system-ui, -apple-system, 'Segoe UI', sans-serif"

  return (
    <div
      className={["flex min-h-dvh w-full items-center justify-center text-foreground", themeClass]
        .filter(Boolean)
        .join(" ")}
      style={{
        fontFamily,
        ...(embed.scale !== 1 ? { zoom: embed.scale } : {}),
      }}
    >
      <style>{"html, body { background: transparent !important; }"}</style>
      {resolved ? (
        <EmbedTimer
          label={resolved.timer.label}
          targetDateIsoUtc={resolved.timer.targetDate}
          timezone={resolved.timer.timezone}
          layout={embed.layout}
          // Timer color acts as the default accent (contract open question 5).
          accent={embed.accent ?? parseHexColor(resolved.timer.color)}
          background={cardBackground}
          doneText={embed.doneText}
          endMode={embed.endMode}
          labels={embed.labels}
          restartOnFinish={resolved.timer.refreshOnFinish}
          showTarget={embed.showTarget}
          transparent={transparent}
          attribution={attribution}
        />
      ) : (
        <EmbedUnavailableCard
          attribution={attribution}
          background={cardBackground}
          layout={embed.layout}
          transparent={transparent}
        />
      )}
    </div>
  )
}

import { ImageResponse } from "next/og"
import { notFound } from "next/navigation"

import { socialImageContentType, socialImageSize } from "@/app/social-image"
import { formatMessage, isSupportedLocale } from "@/lib/i18n/messages"
import { formatOgDateLabel, ogCountdownSnapshot, ogProgressFraction } from "@/lib/og/data"
import { loadOgFonts } from "@/lib/og/fonts"
import { TimerOgImage } from "@/lib/og/image"
import { isRoutableShareId } from "@/lib/share-model"
import { resolveTimerShare } from "@/lib/share-service.server"

export const runtime = "nodejs"
export const revalidate = 15
export const alt = "tickward shared timer preview"
export const size = socialImageSize
export const contentType = socialImageContentType

export default async function OpenGraphImage(props: Readonly<{ params: Promise<{ id: string; locale: string }> }>) {
  const { id, locale } = await props.params
  if (!isSupportedLocale(locale)) notFound()
  if (!isRoutableShareId(id)) notFound()

  const resolved = await resolveTimerShare(id)
  if (!resolved) notFound()

  const nowMs = Date.now()
  const timer = resolved.timer
  const targetDate = timer.targetDate

  return new ImageResponse(
    <TimerOgImage
      title={timer.label || formatMessage("app.title.sharedTimer", {}, locale)}
      dateLabel={formatOgDateLabel(targetDate, timer.timezone)}
      countdown={ogCountdownSnapshot(targetDate, nowMs)}
      spaceName={timer.spaceName ?? "Shared timer"}
      spaceColor={timer.spaceColor || timer.color || "#2563eb"}
      progressFraction={ogProgressFraction(timer.createdAt, targetDate, nowMs)}
    />,
    {
      ...size,
      fonts: await loadOgFonts(),
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
      },
    },
  )
}

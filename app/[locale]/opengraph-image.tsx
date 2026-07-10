import { ImageResponse } from "next/og"
import { notFound } from "next/navigation"

import { SocialImage, socialImageAlt, socialImageContentType, socialImageSize } from "@/app/social-image"
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/messages"
import { loadOgFonts } from "@/lib/og/fonts"

export const runtime = "nodejs"
// Next image-route alt exports are static, so localized routes pin default copy.
export const alt = socialImageAlt(DEFAULT_LOCALE)
export const size = socialImageSize
export const contentType = socialImageContentType

export default async function OpenGraphImage(props: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await props.params
  if (!isSupportedLocale(locale)) notFound()

  return new ImageResponse(<SocialImage />, { ...size, fonts: await loadOgFonts() })
}

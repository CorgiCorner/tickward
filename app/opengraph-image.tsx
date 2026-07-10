import { ImageResponse } from "next/og"

import { SocialImage, socialImageAlt, socialImageContentType, socialImageSize } from "@/app/social-image"
import { DEFAULT_LOCALE } from "@/lib/i18n/messages"
import { loadOgFonts } from "@/lib/og/fonts"

export const runtime = "nodejs"
export const alt = socialImageAlt(DEFAULT_LOCALE)
export const size = socialImageSize
export const contentType = socialImageContentType

export default async function OpenGraphImage() {
  return new ImageResponse(<SocialImage />, { ...size, fonts: await loadOgFonts() })
}

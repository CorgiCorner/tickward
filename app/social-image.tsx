import { DEFAULT_LOCALE, formatMessage, type Locale } from "@/lib/i18n/messages"
import { DefaultOgImage, OG_IMAGE_SIZE } from "@/lib/og/image"

export const socialImageSize = OG_IMAGE_SIZE

export const socialImageContentType = "image/png"

export function socialImageAlt(locale: Locale = DEFAULT_LOCALE) {
  return formatMessage("app.socialImage.alt", {}, locale)
}

export function SocialImage() {
  return <DefaultOgImage />
}

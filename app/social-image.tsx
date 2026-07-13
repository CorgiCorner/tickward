import { DEFAULT_LOCALE, formatMessage, type Locale } from "@/lib/i18n/messages"
import { DefaultOgImage } from "@/lib/og/image"

export { OG_IMAGE_SIZE as socialImageSize } from "@/lib/og/image"

export const socialImageContentType = "image/png"

export function socialImageAlt(locale: Locale = DEFAULT_LOCALE) {
  return formatMessage("app.socialImage.alt", {}, locale)
}

export function SocialImage() {
  return <DefaultOgImage />
}

import { socialImageAlt } from "@/app/social-image"
import { DEFAULT_LOCALE } from "@/lib/i18n/messages"

export const runtime = "nodejs"
// Next image-route alt exports are static, so localized routes pin default copy.
export const alt = socialImageAlt(DEFAULT_LOCALE)
export { socialImageSize as size, socialImageContentType as contentType } from "@/app/social-image"

export { default } from "./opengraph-image"

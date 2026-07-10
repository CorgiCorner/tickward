import OpenGraphImage from "./opengraph-image"

import { socialImageAlt, socialImageContentType, socialImageSize } from "@/app/social-image"
import { DEFAULT_LOCALE } from "@/lib/i18n/messages"

export const runtime = "nodejs"
// Next image-route alt exports are static, so localized routes pin default copy.
export const alt = socialImageAlt(DEFAULT_LOCALE)
export const size = socialImageSize
export const contentType = socialImageContentType

export default OpenGraphImage

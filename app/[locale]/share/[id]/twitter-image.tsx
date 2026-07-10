import OpenGraphImage from "./opengraph-image"

import { socialImageContentType, socialImageSize } from "@/app/social-image"

export const runtime = "nodejs"
export const revalidate = 15
export const alt = "tickward shared timer preview"
export const size = socialImageSize
export const contentType = socialImageContentType

export default OpenGraphImage

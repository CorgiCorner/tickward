import { ImageResponse } from "next/og"

import { SocialImage, socialImageContentType, socialImageSize } from "@/app/social-image"

export const runtime = "edge"
export const size = socialImageSize
export const contentType = socialImageContentType

export default function OpenGraphImage() {
  return new ImageResponse(<SocialImage />, size)
}

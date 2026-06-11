import { ImageResponse } from "next/og"

import { SocialImage, socialImageAlt, socialImageContentType, socialImageSize } from "@/app/social-image"

export const runtime = "edge"
export const alt = socialImageAlt()
export const size = socialImageSize
export const contentType = socialImageContentType

export default function TwitterImage() {
  return new ImageResponse(<SocialImage />, size)
}

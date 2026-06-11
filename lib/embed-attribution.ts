import { getSiteHostname, getSiteOrigin } from "@/lib/site-config"

export type EmbedAttribution = {
  label: string
  href: string
}

// Attribution is derived from the configured origin, never hardcoded to the
// hosted product. Kept behind this one function so a future white-label
// toggle stays a one-line change.
export function getEmbedAttribution(): EmbedAttribution {
  return {
    label: getSiteHostname(),
    href: `${getSiteOrigin()}/?ref=embed`,
  }
}

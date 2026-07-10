import type { ReactNode } from "react"

import type { UserRole } from "@/lib/auth/permissions"

export type MarketingSitemapEntry = {
  path: string
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly"
  priority: number
}

export type MarketingFooterLink = {
  href: string
  label: string
  hrefLang?: string
  country?: string
}

export type MarketingFooterSection = {
  ariaLabel: string
  heading: string
  links: MarketingFooterLink[]
}

export type MarketingCountryCalendarGroup = {
  code: string
  countryLabel: string
  links: MarketingFooterLink[]
}

export type AccountMenuLinkIcon = "shield"

export type AccountMenuLink = {
  href: string
  label: string
  /** Optional icon from the built-in account menu icon set. */
  icon?: AccountMenuLinkIcon
  /** Render only when the signed-in user has this role. */
  requiredRole?: UserRole
}

export type AppExtensions = {
  renderHead?: () => ReactNode
  accountMenuLinks?: (locale: string) => AccountMenuLink[]
  marketingFooterLinks?: () => MarketingFooterLink[]
  marketingFooterSections?: (locale: string) => MarketingFooterSection[]
  marketingCountryCalendars?: (locale: string) => MarketingCountryCalendarGroup[]
  marketingHomeEmbedHref?: () => string
  marketingHomeUseCases?: (locale: string) => MarketingFooterLink[]
  marketingSitemapEntries?: () => MarketingSitemapEntry[]
  llmsMarketingLinks?: () => MarketingFooterLink[]
}

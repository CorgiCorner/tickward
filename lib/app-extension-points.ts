import type { ReactNode } from "react"

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

export type AppExtensions = {
  renderHead?: () => ReactNode
  marketingFooterLinks?: () => MarketingFooterLink[]
  marketingFooterSections?: (locale: string) => MarketingFooterSection[]
  marketingCountryCalendars?: (locale: string) => MarketingCountryCalendarGroup[]
  marketingHomeEmbedHref?: () => string
  marketingHomeUseCases?: (locale: string) => MarketingFooterLink[]
  marketingSitemapEntries?: () => MarketingSitemapEntry[]
  llmsMarketingLinks?: () => MarketingFooterLink[]
}

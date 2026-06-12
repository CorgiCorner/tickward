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
}

export type MarketingFooterSection = {
  ariaLabel: string
  heading: string
  links: MarketingFooterLink[]
}

export type AppExtensions = {
  renderHead?: () => ReactNode
  marketingFooterLinks?: () => MarketingFooterLink[]
  marketingFooterSections?: (locale: string) => MarketingFooterSection[]
  marketingSitemapEntries?: () => MarketingSitemapEntry[]
}

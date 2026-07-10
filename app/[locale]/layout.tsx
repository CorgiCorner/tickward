import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import { notFound } from "next/navigation"
import Script from "next/script"
import "../globals.css"
import { AccountMenuLinksProvider } from "@/components/account-button"
import { LocaleProvider } from "@/components/locale-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { webMcpInlineScript } from "@/components/webmcp-inline-script"
import { appExtensions } from "@/lib/app-extensions"
import { setActiveLocale } from "@/lib/i18n/active-locale"
import { ogLocale } from "@/lib/i18n/config"
import { formatMessage, isSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/messages"
import { getSiteOrigin, getSiteUrl } from "@/lib/site-config"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

// Every supported locale is rendered at build time; resolveLocale 404s
// unknown locale values at request time. dynamicParams must stay enabled
// because request-time routes (share/[id], embed/[token]) live below this
// layout.
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params
  if (!isSupportedLocale(locale)) notFound()
  setActiveLocale(locale)
  return locale
}

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveLocale(props.params)
  const titleTemplate = formatMessage("app.title.template", {}, locale)
  const brandedDefaultTitle = titleTemplate.replace("%s", formatMessage("app.title.default", {}, locale))

  return {
    metadataBase: getSiteUrl(),
    applicationName: "tickward",
    // title.template does not apply to title.default, so compose the homepage default here.
    title: {
      default: brandedDefaultTitle,
      template: titleTemplate,
    },
    description: formatMessage("app.description", {}, locale),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "tickward",
    },
    // og:image/twitter:image (and their alt text) come from the file conventions
    // app/opengraph-image.tsx and app/twitter-image.tsx; do not duplicate here.
    openGraph: {
      title: formatMessage("app.title.default", {}, locale),
      description: formatMessage("app.description", {}, locale),
      url: getSiteOrigin(),
      siteName: "tickward",
      type: "website",
      locale: ogLocale(locale),
    },
    twitter: {
      card: "summary_large_image",
      title: formatMessage("app.title.default", {}, locale),
      description: formatMessage("app.description", {}, locale),
    },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode
  params: Promise<{ locale: string }>
}>) {
  const locale = await resolveLocale(params)

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <Script
          id="tickward-webmcp-tools"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: webMcpInlineScript() }}
        />
        {appExtensions.renderHead?.()}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <LocaleProvider locale={locale}>
          <ThemeProvider>
            <TooltipProvider delayDuration={150}>
              <AccountMenuLinksProvider value={appExtensions.accountMenuLinks?.(locale) ?? []}>
                {children}
                <Toaster />
              </AccountMenuLinksProvider>
            </TooltipProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  )
}

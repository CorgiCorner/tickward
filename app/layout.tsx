import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { appExtensions } from "@/lib/app-extensions"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { socialImageAlt, socialImageContentType, socialImageSize } from "@/app/social-image"
import { formatMessage } from "@/lib/i18n/messages"
import { getSiteOrigin, getSiteUrl } from "@/lib/site-config"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: "tickward",
  title: {
    default: formatMessage("app.title.default"),
    template: formatMessage("app.title.template"),
  },
  description: formatMessage("app.description"),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "tickward",
  },
  openGraph: {
    title: formatMessage("app.title.default"),
    description: formatMessage("app.description"),
    url: getSiteOrigin(),
    siteName: "tickward",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: socialImageSize.width,
        height: socialImageSize.height,
        alt: socialImageAlt(),
        type: socialImageContentType,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: formatMessage("app.title.default"),
    description: formatMessage("app.description"),
    images: [
      {
        url: "/twitter-image",
        alt: socialImageAlt(),
        width: socialImageSize.width,
        height: socialImageSize.height,
      },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta property="og:image:alt" content={socialImageAlt()} />
        <meta name="twitter:image:alt" content={socialImageAlt()} />
        {appExtensions.renderHead?.()}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <TooltipProvider delayDuration={150}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

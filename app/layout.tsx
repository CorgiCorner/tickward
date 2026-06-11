import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import { appExtensions } from "@/lib/app-extensions"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { webMcpInlineScript } from "@/components/webmcp-inline-script"
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
  // og:image/twitter:image (and their alt text) come from the file conventions
  // app/opengraph-image.tsx and app/twitter-image.tsx — do not duplicate here.
  openGraph: {
    title: formatMessage("app.title.default"),
    description: formatMessage("app.description"),
    url: getSiteOrigin(),
    siteName: "tickward",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: formatMessage("app.title.default"),
    description: formatMessage("app.description"),
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
        <Script
          id="tickward-webmcp-tools"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: webMcpInlineScript() }}
        />
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

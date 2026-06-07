"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { PropsWithChildren } from "react"

export function ThemeProvider({ children }: Readonly<PropsWithChildren>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}

"use client"

import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react"

type ThemeContextValue = {
  forcedTheme?: string
  resolvedTheme?: string
  setTheme: (theme: string) => void
  systemTheme?: string
  theme?: string
  themes: string[]
}

type ThemeProviderProps = PropsWithChildren<{
  attribute?: string | string[]
  defaultTheme?: string
  enableColorScheme?: boolean
  enableSystem?: boolean
  forcedTheme?: string
  themes?: string[]
  value?: Record<string, string>
}>

const FALLBACK_THEMES = ["light", "dark"]
const ThemeContext = createContext<ThemeContextValue>({
  resolvedTheme: "light",
  setTheme: () => {},
  systemTheme: "light",
  theme: "light",
  themes: [...FALLBACK_THEMES, "system"],
})

function resolveTheme(theme: string, enableSystem: boolean) {
  if (theme !== "system" || !enableSystem) return theme
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyThemeAttribute(args: {
  attribute: string | string[]
  resolvedTheme: string
  themes: string[]
  value?: Record<string, string>
}) {
  const root = document.documentElement
  const nextValue = args.value?.[args.resolvedTheme] ?? args.resolvedTheme
  const attributes = Array.isArray(args.attribute) ? args.attribute : [args.attribute]

  for (const attribute of attributes) {
    if (attribute === "class") {
      root.classList.remove(...args.themes.map((theme) => args.value?.[theme] ?? theme))
      root.classList.add(nextValue)
      continue
    }

    root.setAttribute(attribute, nextValue)
  }
}

export function ThemeProvider({
  attribute = "data-theme",
  children,
  defaultTheme = "system",
  enableColorScheme = true,
  enableSystem = true,
  forcedTheme,
  themes = FALLBACK_THEMES,
  value,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState(forcedTheme ?? defaultTheme)
  const activeTheme = forcedTheme ?? theme
  const resolvedTheme = resolveTheme(activeTheme, enableSystem)

  useEffect(() => {
    applyThemeAttribute({ attribute, resolvedTheme, themes, value })
    if (enableColorScheme && (resolvedTheme === "light" || resolvedTheme === "dark")) {
      document.documentElement.style.colorScheme = resolvedTheme
    }
  }, [attribute, enableColorScheme, resolvedTheme, themes, value])

  const context = useMemo<ThemeContextValue>(
    () => ({
      forcedTheme,
      resolvedTheme,
      setTheme: (nextTheme) => {
        if (!forcedTheme) setThemeState(nextTheme)
      },
      systemTheme: "light",
      theme: activeTheme,
      themes: enableSystem ? [...themes, "system"] : themes,
    }),
    [activeTheme, enableSystem, forcedTheme, themes, resolvedTheme],
  )

  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}

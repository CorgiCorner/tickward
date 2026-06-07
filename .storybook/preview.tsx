import type { Preview } from "@storybook/nextjs-vite"
import type { CSSProperties } from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import "../app/globals.css"

function response(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  })
}

function installStorybookApiMocks() {
  if (typeof window === "undefined") return
  const currentFetch = window.fetch.bind(window) as typeof window.fetch & {
    __tickwardStorybookMock?: boolean
  }
  if (currentFetch.__tickwardStorybookMock) return

  const mockFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(rawUrl, window.location.origin)

    if (url.pathname === "/api/projects/restore") {
      return Promise.resolve(new Response("Not found.", { status: 404 }))
    }
    if (url.pathname === "/api/projects/save") {
      return Promise.resolve(response({ ok: true }))
    }
    if (url.pathname === "/api/share/create") {
      return Promise.resolve(response({ url: "/s/storybook-share" }))
    }
    if (url.pathname === "/api/share/resolve" || url.pathname === "/api/share/resolve-batch") {
      return Promise.resolve(response({ results: [] }))
    }
    if (url.pathname === "/api/unsplash/search") {
      return Promise.resolve(response({ results: [] }))
    }

    return currentFetch(input, init)
  }) as typeof window.fetch & { __tickwardStorybookMock?: boolean }

  mockFetch.__tickwardStorybookMock = true
  window.fetch = mockFetch
}

installStorybookApiMocks()

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <TooltipProvider delayDuration={150}>
          <div
            className="min-h-screen bg-background p-6 text-foreground"
            style={
              {
                "--font-geist-sans": "ui-sans-serif, system-ui, sans-serif",
                "--font-geist-mono": "ui-monospace, SFMono-Regular, monospace",
              } as CSSProperties
            }
          >
            <Story />
            <Toaster richColors />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    ),
  ],
}

export default preview

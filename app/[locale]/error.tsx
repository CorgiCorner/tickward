"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { reloadPage, reportClientError, shouldRecoverFromChunkError, toClientErrorReport } from "@/lib/error-reporting"
import { formatMessage } from "@/lib/i18n/messages"

// Route-segment error boundary. Replaces the framework's bare fallback with a
// branded screen, recovers automatically from chunk/version-skew errors, and
// reports everything else so the cause is traceable.
export default function RouteError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    if (shouldRecoverFromChunkError(error)) {
      reloadPage()
      return
    }
    reportClientError(toClientErrorReport({ kind: "react", error, digest: error.digest }))
  }, [error])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
      <h1 className="text-lg font-semibold">{formatMessage("error.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{formatMessage("error.description")}</p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>{formatMessage("error.reload")}</Button>
        <Button variant="outline" onClick={() => globalThis.history.back()}>
          {formatMessage("error.back")}
        </Button>
      </div>
      {error.digest ? (
        <p className="font-mono text-[0.6875rem] text-muted-foreground">
          {formatMessage("error.reference", { id: error.digest })}
        </p>
      ) : null}
    </main>
  )
}

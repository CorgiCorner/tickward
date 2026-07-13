"use client"

import { DownloadIcon, UploadIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AccountImportResult } from "@/lib/account-migration"
import { runInBackground } from "@/lib/background-task"
import { formatMessage } from "@/lib/i18n/messages"

const MAX_IMPORT_BYTES = 10 * 1024 * 1024

function importSummary(result: AccountImportResult) {
  return formatMessage("migration.import.result", {
    conflicts: result.conflicts.length,
    created: result.created.length,
    notificationPreferences: result.notificationPreferencesImported,
    preferences: result.accountPreferencesImported ? 1 : 0,
    profile: result.profileImported ? 1 : 0,
    readOnly: result.readOnlyProjectIds.length,
    replaced: result.replaced.length,
  })
}

function apiErrorMessage(body: unknown) {
  if (!body || typeof body !== "object") return null
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== "object") return null
  const message = (error as { message?: unknown }).message
  return typeof message === "string" ? message : null
}

export function AccountMigrationSettings() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<AccountImportResult | null>(null)

  async function importFile(file: File) {
    setMessage(null)
    setResult(null)
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage(formatMessage("migration.import.tooLarge"))
      return
    }

    setBusy(true)
    try {
      const accountExport = JSON.parse(await file.text()) as unknown
      const response = await fetch("/api/account/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conflictStrategy: "skip", export: accountExport }),
      })
      const body = (await response.json().catch(() => null)) as AccountImportResult | null
      if (!response.ok) throw new Error(apiErrorMessage(body) ?? formatMessage("migration.import.failed"))
      setResult(body)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : formatMessage("migration.import.failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="migration" className="scroll-mt-28 border-t border-border py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium">{formatMessage("migration.account.title")}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {formatMessage("migration.account.description")}
          </p>
        </div>
        <Button asChild type="button" variant="outline" size="sm" className="shrink-0">
          <a href="/api/account/export" download>
            <DownloadIcon className="size-3.5" />
            {formatMessage("migration.export.action")}
          </a>
        </Button>
      </div>
      <div className="mt-3 grid gap-2">
        <Input
          accept="application/json,.json"
          aria-label={formatMessage("migration.import.action")}
          disabled={busy}
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            if (file) runInBackground("migration.import", importFile(file))
          }}
        />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UploadIcon className="size-3.5" />
          {busy ? formatMessage("migration.import.loading") : formatMessage("migration.import.description")}
        </div>
        {message ? (
          <p aria-live="polite" className="text-xs text-destructive">
            {message}
          </p>
        ) : null}
        {result ? (
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {importSummary(result)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

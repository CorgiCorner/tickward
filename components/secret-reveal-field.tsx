"use client"

import { CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatMessage } from "@/lib/i18n/messages"

const passwordManagerIgnoreProps = {
  autoComplete: "off",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-nordpass-ignore": "true",
  "data-np-autofill": "false",
  "data-np-ignore": "true",
} as const

export function SecretRevealField(
  props: Readonly<{
    copiedMessage: string
    copyLabel: string
    value: string
  }>,
) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="flex gap-2">
      <Input
        value={props.value}
        readOnly
        type={revealed ? "text" : "password"}
        className="min-w-0 font-mono text-xs"
        {...passwordManagerIgnoreProps}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label={formatMessage(revealed ? "common.hideSecret" : "common.showSecret")}
        onClick={() => setRevealed((value) => !value)}
      >
        {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label={props.copyLabel}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(props.value)
            toast.success(props.copiedMessage)
          } catch {
            toast.error(formatMessage("mcp.copyFailed"))
          }
        }}
      >
        <CopyIcon className="size-4" />
      </Button>
    </div>
  )
}

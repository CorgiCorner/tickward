"use client"

import { ShieldCheckIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth/auth-client"
import { logClientError } from "@/lib/client-errors"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"

export function ProjectClaimSlot(
  props: Readonly<{
    cloudProjectId?: string
    projectName: string
    restoreKey: string | null
    variant?: "card" | "button"
  }>,
) {
  const session = authClient.useSession()
  const claimActiveProject = useTimerStore((s) => s.claimActiveProject)
  const [loading, setLoading] = useState(false)
  const authUnavailable = session.error?.status === 501
  const sessionPending = Boolean(session.isPending)
  const variant = props.variant ?? "card"

  if (!props.restoreKey && !props.cloudProjectId) return null

  if (props.cloudProjectId) {
    return (
      <div className="rounded-lg border p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheckIcon className="size-4 text-muted-foreground" />
          {formatMessage("auth.claim.alreadyClaimed")}
        </div>
      </div>
    )
  }

  if (sessionPending) {
    return <div className="rounded-lg border p-3 text-xs text-muted-foreground">{formatMessage("auth.loading")}</div>
  }

  if (!session.data?.user || authUnavailable) {
    return (
      <div className="rounded-lg border p-3 text-xs text-muted-foreground">
        {formatMessage(authUnavailable ? "auth.error.unavailable" : "auth.claim.signInHint")}
      </div>
    )
  }

  async function claimProject() {
    setLoading(true)
    try {
      const status = await claimActiveProject()
      if (status === "claimed") {
        toast.success(formatMessage("auth.claim.claimed"))
        return
      }
      if (status === "unauthenticated") toast.error(formatMessage("errors.signInRequired"))
      if (status === "unsupported") toast.error(formatMessage("errors.claimUnsupported"))
      if (status === "not_found") toast.error(formatMessage("errors.notFound"))
      if (status === "sync_failed") toast.error(formatMessage("auth.claim.syncFailed"))
    } catch (error) {
      logClientError("settings.claimProject", error)
      toast.error(formatMessage("errors.claimFailed"))
    } finally {
      setLoading(false)
    }
  }

  const action = (
    <Button
      variant="outline"
      size="sm"
      loading={loading}
      className={variant === "card" ? "w-full justify-start" : "w-full justify-start"}
      onClick={() => void claimProject()}
    >
      <ShieldCheckIcon className="size-4" />
      {formatMessage("auth.claim.action")}
    </Button>
  )

  if (variant === "button") return action

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex gap-3">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{formatMessage("auth.claim.title")}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatMessage("auth.claim.description", { project: props.projectName })}
          </div>
          <div className="mt-3">{action}</div>
        </div>
      </div>
    </div>
  )
}

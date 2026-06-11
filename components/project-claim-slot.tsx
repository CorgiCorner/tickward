"use client"

import { ShieldCheckIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth/auth-client"
import { logClientError } from "@/lib/client-errors"
import { formatMessage } from "@/lib/i18n/messages"
import {
  dismissProjectClaim,
  isProjectClaimDismissed,
  subscribeProjectClaimDismissed,
} from "@/lib/project-claim-dismissal.client"
import { useTimerStore } from "@/lib/store"

export const PROJECT_CLAIM_TOAST_DELAY_MS = 30_000

function projectClaimToastId(projectId: string) {
  return `project-claim:${projectId}`
}

function useProjectClaimDismissed(projectId: string | null | undefined) {
  return useSyncExternalStore(
    (callback) => subscribeProjectClaimDismissed(projectId, callback),
    () => isProjectClaimDismissed(projectId),
    () => false,
  )
}

export function ProjectClaimSlot(
  props: Readonly<{
    cloudProjectId?: string
    onClaimed?: () => void
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
        props.onClaimed?.()
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
      className="w-full justify-start"
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

function ProjectClaimToastContent(
  props: Readonly<{
    onClaimed: () => void
    onDismiss: () => void
    projectName: string
    restoreKey: string
  }>,
) {
  return (
    <div
      data-slot="project-claim-toast"
      className="w-[min(calc(100vw-2rem),24rem)] rounded-md border bg-popover p-3 text-popover-foreground shadow-lg shadow-black/5"
    >
      <div className="flex gap-3">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-medium">{formatMessage("home.claimProject.title")}</div>
            <button
              type="button"
              aria-label={formatMessage("common.dismiss")}
              className="mt-0.5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              onClick={props.onDismiss}
            >
              <XIcon className="size-4" />
            </button>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatMessage("home.claimProject.description", { project: props.projectName })}
          </div>
          <div className="mt-3">
            <ProjectClaimSlot
              restoreKey={props.restoreKey}
              projectName={props.projectName}
              variant="button"
              onClaimed={props.onClaimed}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProjectClaimToast(
  props: Readonly<{
    cloudProjectId?: string
    projectId: string | null | undefined
    projectName: string
    restoreKey: string | null
    timerCount: number
  }>,
) {
  const session = authClient.useSession()
  const dismissed = useProjectClaimDismissed(props.projectId)
  const toastIdRef = useRef<number | string | null>(null)
  const shownProjectIdRef = useRef<string | null>(null)

  const hasTimer = props.timerCount > 0
  const projectId = props.projectId ?? null
  const restoreKey = props.restoreKey
  const eligible = Boolean(
    session.data?.user && projectId && restoreKey && !props.cloudProjectId && !dismissed && hasTimer,
  )

  useEffect(() => {
    if (toastIdRef.current && shownProjectIdRef.current !== projectId) {
      toast.dismiss(toastIdRef.current)
      toastIdRef.current = null
      shownProjectIdRef.current = null
    }

    if (!eligible || !projectId || !restoreKey) {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current)
        toastIdRef.current = null
        shownProjectIdRef.current = null
      }
      return
    }

    if (toastIdRef.current) return

    const eligibleProjectId = projectId
    const eligibleRestoreKey = restoreKey

    const timeoutId = globalThis.setTimeout(() => {
      const id = toast.custom(
        (toastId) => {
          function dismissToastForSession() {
            dismissProjectClaim(eligibleProjectId)
            toast.dismiss(toastId)
            toastIdRef.current = null
            shownProjectIdRef.current = null
          }

          function dismissAfterClaim() {
            toast.dismiss(toastId)
            toastIdRef.current = null
            shownProjectIdRef.current = null
          }

          return (
            <ProjectClaimToastContent
              restoreKey={eligibleRestoreKey}
              projectName={props.projectName}
              onDismiss={dismissToastForSession}
              onClaimed={dismissAfterClaim}
            />
          )
        },
        {
          id: projectClaimToastId(eligibleProjectId),
          duration: Infinity,
          dismissible: false,
          position: "bottom-right",
        },
      )
      toastIdRef.current = id
      shownProjectIdRef.current = eligibleProjectId
    }, PROJECT_CLAIM_TOAST_DELAY_MS)

    return () => globalThis.clearTimeout(timeoutId)
  }, [eligible, projectId, props.projectName, restoreKey])

  useEffect(() => {
    return () => {
      if (toastIdRef.current) toast.dismiss(toastIdRef.current)
    }
  }, [])

  return null
}

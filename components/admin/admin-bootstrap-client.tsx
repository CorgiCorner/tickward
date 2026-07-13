"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { SignInPageClient } from "@/components/sign-in-auth"
import { authClient } from "@/lib/auth/auth-client"
import { formatMessage } from "@/lib/i18n/messages"

export function AdminBootstrapClient(props: Readonly<{ adminPath: string; homePath: string; setupPath: string }>) {
  const router = useRouter()
  const session = authClient.useSession()
  const attemptedUser = useRef<string | null>(null)
  const [error, setError] = useState(false)
  const userId = session.data?.user?.id ?? null

  useEffect(() => {
    if (!userId || attemptedUser.current === userId) return
    attemptedUser.current = userId

    void fetch("/api/setup/claim-admin", { method: "POST" })
      .then(async (response) => {
        if (response.status === 409) {
          router.replace(props.homePath)
          return
        }
        if (!response.ok) throw new Error("admin bootstrap failed")
        await session.refetch()
        router.replace(props.adminPath)
        router.refresh()
      })
      .catch(() => setError(true))
  }, [props.adminPath, props.homePath, router, session, userId])

  if (session.isPending) {
    return (
      <main className="mx-auto grid w-full max-w-[440px] flex-1 content-center gap-2 px-4 py-8 text-center">
        <h1 className="text-2xl font-semibold tracking-normal">{formatMessage("setup.heading")}</h1>
        <p className="text-sm text-muted-foreground">{formatMessage("setup.checkingSession")}</p>
      </main>
    )
  }

  if (userId) {
    return (
      <main className="mx-auto grid w-full max-w-[440px] flex-1 content-center gap-2 px-4 py-8 text-center">
        <h1 className="text-2xl font-semibold tracking-normal">{formatMessage("setup.heading")}</h1>
        <p className="text-sm text-muted-foreground">
          {error ? formatMessage("setup.claimFailed") : formatMessage("setup.claiming")}
        </p>
      </main>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto grid w-full max-w-[440px] gap-1 px-4 pt-8 text-center">
        <h1 className="text-2xl font-semibold tracking-normal">{formatMessage("setup.heading")}</h1>
        <p className="text-sm text-muted-foreground">{formatMessage("setup.description")}</p>
      </section>
      <SignInPageClient nextPath={props.setupPath} />
    </div>
  )
}

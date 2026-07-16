"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { useAccountPreferences } from "@/components/account-preferences-provider"
import { countUpSettingsHref } from "@/components/count-up-navigation"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth/auth-client"
import { formatMessage } from "@/lib/i18n/messages"
import { setLocalCountUpIntroDismissed, useLocalCountUpIntroDismissed } from "@/lib/local-count-up-intro.client"

function IntroNote(props: Readonly<{ dismissed: boolean; dismiss: () => Promise<void> | void }>) {
  const [dismissedNow, setDismissedNow] = useState(false)
  const pathname = usePathname()
  if (props.dismissed || dismissedNow) return null

  return (
    <div className="mb-3 rounded-xl border bg-muted/30 p-3 text-sm" data-slot="count-up-intro-note">
      <p>{formatMessage("countUp.intro.message")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={countUpSettingsHref(pathname)}>{formatMessage("countUp.intro.changeBehavior")}</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDismissedNow(true)
            void props.dismiss()
          }}
        >
          {formatMessage("common.dismiss")}
        </Button>
      </div>
    </div>
  )
}

function AnonymousCountUpIntroNote() {
  const dismissed = useLocalCountUpIntroDismissed()
  return <IntroNote dismissed={dismissed} dismiss={() => setLocalCountUpIntroDismissed(true)} />
}

function SignedInCountUpIntroNote() {
  const { loading, preferences, updatePreferences } = useAccountPreferences()
  if (loading) return null
  return (
    <IntroNote
      dismissed={preferences.count_up_intro_dismissed}
      dismiss={() =>
        updatePreferences({ count_up_intro_dismissed: true }).then(
          () => undefined,
          () => undefined,
        )
      }
    />
  )
}

export function CountUpIntroNote() {
  const session = authClient.useSession()
  if (session.isPending) return null
  if (session.data?.user) return <SignedInCountUpIntroNote />
  return <AnonymousCountUpIntroNote />
}

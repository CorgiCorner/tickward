"use client"

import { ArrowLeftIcon, MailIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OtpInput } from "@/components/ui/otp-input"
import { authClient } from "@/lib/auth/auth-client"
import { authErrorMessage, authErrorRetryAfter } from "@/lib/auth/auth-client-errors"
import { formatMessage } from "@/lib/i18n/messages"

const OTP_COOLDOWN_SECONDS = 60
const DEFAULT_SIGN_IN_NEXT_PATH = "/"

const emailInputProps = {
  autoCapitalize: "none",
  autoComplete: "off",
  autoCorrect: "off",
  enterKeyHint: "send",
  inputMode: "email",
  name: "email-code-address",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-form-type": "other",
  "data-nordpass-ignore": "true",
  "data-np-autofill": "false",
  "data-np-ignore": "true",
} as const

function cooldownKey(email: string) {
  return `tickward:otp-cooldown:${email}`
}

function readCooldownUntil(email: string) {
  if (typeof window === "undefined" || !email) return 0
  const value = window.localStorage.getItem(cooldownKey(email))
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function writeCooldownUntil(email: string, seconds: number) {
  if (typeof window === "undefined" || !email) return 0
  const cooldownUntil = Date.now() + seconds * 1000
  window.localStorage.setItem(cooldownKey(email), String(cooldownUntil))
  return cooldownUntil
}

function safeNextPath(value: string | null | undefined) {
  const nextPath = value?.trim()
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) return DEFAULT_SIGN_IN_NEXT_PATH
  return nextPath
}

function signInPathWithNext(pathname: string, nextPath: string) {
  const params = new URLSearchParams()
  if (nextPath !== DEFAULT_SIGN_IN_NEXT_PATH) params.set("next", nextPath)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

function otpPath(email: string, nextPath: string) {
  const params = new URLSearchParams({ email })
  if (nextPath !== DEFAULT_SIGN_IN_NEXT_PATH) params.set("next", nextPath)
  return `/sign-in/otp?${params.toString()}`
}

function useCooldown(email: string) {
  const [now, setNow] = useState(() => Date.now())
  const [cooldownUntil, setCooldownUntil] = useState(0)

  useEffect(() => {
    setCooldownUntil(readCooldownUntil(email))
  }, [email])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const remainingSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  return {
    remainingSeconds,
    start(seconds = OTP_COOLDOWN_SECONDS) {
      setCooldownUntil(writeCooldownUntil(email, seconds))
      setNow(Date.now())
    },
  }
}

function AuthShell(props: Readonly<{ centered?: boolean; children: ReactNode; description: string; title: string }>) {
  return (
    <main
      className={[
        "mx-auto grid w-full max-w-[440px] gap-6 px-4 py-8",
        props.centered ? "flex-1 content-center text-center" : "",
      ].join(" ")}
    >
      <div className={["grid gap-1", props.centered ? "justify-items-center" : ""].join(" ")}>
        <h1 className="text-2xl font-semibold tracking-normal">{props.title}</h1>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </div>
      {props.children}
    </main>
  )
}

export function SignInPageClient(props: Readonly<{ nextPath?: string }>) {
  const router = useRouter()
  const session = authClient.useSession()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const normalizedEmail = email.trim().toLowerCase()
  const nextPath = safeNextPath(props.nextPath)
  const cooldown = useCooldown(normalizedEmail)
  const cooldownActive = cooldown.remainingSeconds > 0

  async function sendCode() {
    if (!normalizedEmail || cooldownActive) return
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "sign-in",
      })
      if (result.error) throw result.error
      cooldown.start()
      toast.success(formatMessage("auth.otp.sent"))
      router.push(otpPath(normalizedEmail, nextPath))
    } catch (error) {
      const retryAfter = authErrorRetryAfter(error)
      if (retryAfter) cooldown.start(retryAfter)
      toast.error(authErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (session.data?.user) {
    return (
      <AuthShell centered title={formatMessage("auth.account")} description={formatMessage("auth.alreadySignedIn")}>
        <Button asChild className="mx-auto w-fit">
          <Link href={nextPath}>
            <UserIcon className="size-4" />
            {formatMessage("auth.accountSettings")}
          </Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={formatMessage("auth.signIn")} description={formatMessage("auth.description.signIn")}>
      <form
        autoComplete="off"
        className="grid gap-4 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void sendCode()
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="auth-email">{formatMessage("auth.email")}</Label>
          <Input
            id="auth-email"
            type="email"
            value={email}
            disabled={loading}
            {...emailInputProps}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={formatMessage("auth.email.placeholder")}
          />
        </div>

        <Button type="submit" loading={loading} disabled={!normalizedEmail || cooldownActive}>
          {!loading && <MailIcon className="size-4" />}
          {cooldownActive
            ? formatMessage("auth.otp.resendIn", { seconds: cooldown.remainingSeconds })
            : formatMessage("auth.sendCode")}
        </Button>
      </form>
    </AuthShell>
  )
}

export function OtpSignInPageClient(props: Readonly<{ email: string; nextPath?: string }>) {
  const router = useRouter()
  const session = authClient.useSession()
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const email = useMemo(() => props.email.trim().toLowerCase(), [props.email])
  const nextPath = safeNextPath(props.nextPath)
  const cooldown = useCooldown(email)
  const cooldownActive = cooldown.remainingSeconds > 0

  async function resendCode() {
    if (!email || cooldownActive) return
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      })
      if (result.error) throw result.error
      cooldown.start()
      toast.success(formatMessage("auth.otp.sent"))
    } catch (error) {
      const retryAfter = authErrorRetryAfter(error)
      if (retryAfter) cooldown.start(retryAfter)
      toast.error(authErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode() {
    const nextCode = code.trim()
    if (!email || nextCode.length !== 6) return
    setLoading(true)
    try {
      const result = await authClient.signIn.emailOtp({ email, otp: nextCode })
      if (result.error) throw result.error
      await session.refetch()
      toast.success(formatMessage("auth.signedIn"))
      router.replace(nextPath)
    } catch (error) {
      toast.error(authErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (!email) {
    return (
      <AuthShell title={formatMessage("auth.verifyCode")} description={formatMessage("auth.description.signIn")}>
        <Button asChild className="w-fit">
          <Link href={signInPathWithNext("/sign-in", nextPath)}>
            <ArrowLeftIcon className="size-4" />
            {formatMessage("auth.signIn")}
          </Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={formatMessage("auth.verifyCode")} description={formatMessage("auth.otp.description", { email })}>
      <form
        className="grid gap-4 rounded-lg border p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void verifyCode()
        }}
      >
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="auth-code">{formatMessage("auth.code")}</Label>
            <OtpInput
              id="auth-code"
              label={formatMessage("auth.code")}
              value={code}
              disabled={loading}
              onChange={(value) => setCode(value.slice(0, 6))}
            />
          </div>

          <Button type="submit" className="w-full" loading={loading} disabled={code.length !== 6}>
            {formatMessage("auth.verifyCode")}
          </Button>

          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={loading || cooldownActive}
              onClick={() => void resendCode()}
            >
              {cooldownActive
                ? formatMessage("auth.otp.resendIn", { seconds: cooldown.remainingSeconds })
                : formatMessage("auth.otp.resend")}
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href={signInPathWithNext("/sign-in", nextPath)}>{formatMessage("auth.otp.changeEmail")}</Link>
            </Button>
          </div>
        </div>
      </form>
    </AuthShell>
  )
}

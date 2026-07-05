"use client"

import { ArrowLeftIcon, CheckIcon, CircleAlertIcon, MailIcon, TimerIcon, UserIcon, UserRoundIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OtpInput } from "@/components/ui/otp-input"
import { authClient } from "@/lib/auth/auth-client"
import { authErrorMessage, authErrorRetryAfter } from "@/lib/auth/auth-client-errors"
import { formatMessage, isSupportedLocale, localeHref, type Locale } from "@/lib/i18n/messages"

const OTP_COOLDOWN_SECONDS = 60
const DEFAULT_SIGN_IN_NEXT_PATH = "/"
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

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

type CooldownControls = {
  remainingSeconds: number
  start: (seconds?: number) => void
}

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

function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email)
}

function hasLocalePrefix(path: string) {
  const pathname = path.split(/[?#]/)[0] ?? ""
  const segment = pathname.split("/")[1] ?? ""
  return isSupportedLocale(segment)
}

function safeNextPath(value: string | null | undefined, locale: Locale) {
  const nextPath = value?.trim()
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) return DEFAULT_SIGN_IN_NEXT_PATH
  if (nextPath === DEFAULT_SIGN_IN_NEXT_PATH || hasLocalePrefix(nextPath)) return nextPath
  return localeHref(locale, nextPath)
}

function signInPathWithNext(locale: Locale, pathname: string, nextPath: string) {
  const params = new URLSearchParams()
  if (nextPath !== DEFAULT_SIGN_IN_NEXT_PATH) params.set("next", nextPath)
  const query = params.toString()
  const path = localeHref(locale, pathname)
  return query ? `${path}?${query}` : path
}

function otpPath(locale: Locale, email: string, nextPath: string) {
  const params = new URLSearchParams({ email })
  if (nextPath !== DEFAULT_SIGN_IN_NEXT_PATH) params.set("next", nextPath)
  return `${localeHref(locale, "/sign-in/otp")}?${params.toString()}`
}

function useCooldown(email: string): CooldownControls {
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

function AuthError(props: Readonly<{ className?: string; id: string; message: string }>) {
  if (!props.message) return null

  return (
    <div
      id={props.id}
      role="alert"
      className={["flex items-center gap-1.5 text-xs text-destructive", props.className ?? ""].join(" ")}
    >
      <CircleAlertIcon className="size-3.5 shrink-0" />
      {props.message}
    </div>
  )
}

function AuthBrand() {
  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
      <TimerIcon className="size-4" strokeWidth={2.5} />
      tickward
    </div>
  )
}

function EmailCodeForm(
  props: Readonly<{
    className?: string
    cooldown: CooldownControls
    email: string
    emailInputId: string
    error: string
    loading: boolean
    onEmailChange: (email: string) => void
    onSubmit: () => void
  }>,
) {
  const cooldownActive = props.cooldown.remainingSeconds > 0
  const errorId = `${props.emailInputId}-error`

  return (
    <form
      autoComplete="off"
      noValidate
      className={props.className ?? "grid gap-4 rounded-lg border p-4"}
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit()
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={props.emailInputId}>{formatMessage("auth.email")}</Label>
        <Input
          id={props.emailInputId}
          type="email"
          value={props.email}
          disabled={props.loading}
          aria-invalid={Boolean(props.error)}
          aria-describedby={props.error ? errorId : undefined}
          {...emailInputProps}
          onChange={(event) => props.onEmailChange(event.target.value)}
          placeholder={formatMessage("auth.email.placeholder")}
        />
      </div>

      <AuthError id={errorId} message={props.error} />

      <Button type="submit" loading={props.loading} disabled={cooldownActive}>
        {!props.loading && <MailIcon className="size-4" />}
        {cooldownActive
          ? formatMessage("auth.otp.resendIn", { seconds: props.cooldown.remainingSeconds })
          : formatMessage("auth.sendCode")}
      </Button>
    </form>
  )
}

function OtpCodeForm(
  props: Readonly<{
    className?: string
    code: string
    codeInputId: string
    cooldown: CooldownControls
    error: string
    loading: boolean
    onChangeEmail: () => void
    onCodeChange: (code: string) => void
    onResendCode: () => void
    onVerifyCode: () => void
  }>,
) {
  const cooldownActive = props.cooldown.remainingSeconds > 0
  const errorId = `${props.codeInputId}-error`

  return (
    <form
      className={props.className ?? "grid gap-4 rounded-lg border p-3 sm:p-4"}
      onSubmit={(event) => {
        event.preventDefault()
        props.onVerifyCode()
      }}
    >
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={props.codeInputId}>{formatMessage("auth.code")}</Label>
          <OtpInput
            id={props.codeInputId}
            label={formatMessage("auth.code")}
            value={props.code}
            disabled={props.loading}
            ariaDescribedBy={props.error ? errorId : undefined}
            ariaInvalid={Boolean(props.error)}
            onChange={(value) => props.onCodeChange(value.slice(0, 6))}
          />
        </div>

        <AuthError id={errorId} message={props.error} />

        <Button type="submit" className="w-full" loading={props.loading}>
          {formatMessage("auth.verifyCode")}
        </Button>

        <div className="grid justify-items-center gap-2">
          <div className="text-center text-xs text-muted-foreground">
            {formatMessage("auth.otp.noCode")}{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs font-medium text-foreground"
              disabled={props.loading || cooldownActive}
              onClick={() => props.onResendCode()}
            >
              {cooldownActive
                ? formatMessage("auth.otp.resendIn", { seconds: props.cooldown.remainingSeconds })
                : formatMessage("auth.otp.resend")}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            disabled={props.loading}
            onClick={() => props.onChangeEmail()}
          >
            <ArrowLeftIcon className="size-3.5" />
            {formatMessage("auth.otp.changeEmail")}
          </Button>
        </div>
      </div>
    </form>
  )
}

function SignInSuccess(props: Readonly<{ onDone: () => void }>) {
  return (
    <div className="mt-2 flex flex-col items-center text-center">
      <div className="grid size-12 place-items-center rounded-full border border-border text-foreground">
        <CheckIcon className="size-6" />
      </div>
      <DialogHeader className="mt-3 items-center gap-1 text-center">
        <DialogTitle className="text-lg">{formatMessage("auth.otp.successTitle")}</DialogTitle>
        <DialogDescription className="leading-6">{formatMessage("auth.otp.successDescription")}</DialogDescription>
      </DialogHeader>
      <Button type="button" className="mt-4 w-full" onClick={props.onDone}>
        {formatMessage("common.done")}
      </Button>
    </div>
  )
}

function normalizeAuthError(error: unknown) {
  return authErrorMessage(error)
}

export function SignInPageClient(props: Readonly<{ nextPath?: string }>) {
  const router = useRouter()
  const locale = useLocale()
  const session = authClient.useSession()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const normalizedEmail = email.trim().toLowerCase()
  const nextPath = safeNextPath(props.nextPath, locale)
  const cooldown = useCooldown(normalizedEmail)

  async function sendCode() {
    setError("")
    if (!isValidEmail(normalizedEmail)) {
      setError(formatMessage("auth.error.invalidEmail"))
      return
    }
    if (cooldown.remainingSeconds > 0) return

    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "sign-in",
      })
      if (result.error) throw result.error
      cooldown.start()
      toast.success(formatMessage("auth.otp.sent"))
      router.push(otpPath(locale, normalizedEmail, nextPath))
    } catch (requestError) {
      const retryAfter = authErrorRetryAfter(requestError)
      if (retryAfter) cooldown.start(retryAfter)
      const message = normalizeAuthError(requestError)
      setError(message)
      toast.error(message)
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
      <EmailCodeForm
        emailInputId="auth-email"
        email={email}
        error={error}
        loading={loading}
        cooldown={cooldown}
        onEmailChange={setEmail}
        onSubmit={() => void sendCode()}
      />
    </AuthShell>
  )
}

export function OtpSignInPageClient(props: Readonly<{ email: string; nextPath?: string }>) {
  const router = useRouter()
  const locale = useLocale()
  const session = authClient.useSession()
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const email = useMemo(() => props.email.trim().toLowerCase(), [props.email])
  const nextPath = safeNextPath(props.nextPath, locale)
  const cooldown = useCooldown(email)

  async function resendCode() {
    setError("")
    if (!email || cooldown.remainingSeconds > 0) return

    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      })
      if (result.error) throw result.error
      cooldown.start()
      toast.success(formatMessage("auth.otp.sent"))
    } catch (requestError) {
      const retryAfter = authErrorRetryAfter(requestError)
      if (retryAfter) cooldown.start(retryAfter)
      const message = normalizeAuthError(requestError)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode() {
    const nextCode = code.trim()
    setError("")
    if (!email || nextCode.length !== 6) {
      setError(formatMessage("auth.otp.incompleteCode"))
      return
    }

    setLoading(true)
    try {
      const result = await authClient.signIn.emailOtp({ email, otp: nextCode })
      if (result.error) throw result.error
      await session.refetch()
      toast.success(formatMessage("auth.signedIn"))
      router.replace(nextPath)
    } catch (requestError) {
      const message = normalizeAuthError(requestError)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  if (!email) {
    return (
      <AuthShell title={formatMessage("auth.verifyCode")} description={formatMessage("auth.description.signIn")}>
        <Button asChild className="w-fit">
          <Link href={signInPathWithNext(locale, "/sign-in", nextPath)}>
            <ArrowLeftIcon className="size-4" />
            {formatMessage("auth.signIn")}
          </Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={formatMessage("auth.verifyCode")} description={formatMessage("auth.otp.description", { email })}>
      <OtpCodeForm
        codeInputId="auth-code"
        code={code}
        error={error}
        loading={loading}
        cooldown={cooldown}
        onCodeChange={setCode}
        onResendCode={() => void resendCode()}
        onVerifyCode={() => void verifyCode()}
        onChangeEmail={() => router.push(signInPathWithNext(locale, "/sign-in", nextPath))}
      />
    </AuthShell>
  )
}

function SignInDialogContent(
  props: Readonly<{
    onDone: () => void
    onSignedIn: () => void
  }>,
) {
  const [step, setStep] = useState<"code" | "email" | "success">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const normalizedEmail = email.trim().toLowerCase()
  const cooldown = useCooldown(normalizedEmail)

  async function sendCode() {
    setError("")
    if (!isValidEmail(normalizedEmail)) {
      setError(formatMessage("auth.error.invalidEmail"))
      return
    }
    if (cooldown.remainingSeconds > 0) return

    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "sign-in",
      })
      if (result.error) throw result.error
      cooldown.start()
      setCode("")
      setStep("code")
      toast.success(formatMessage("auth.otp.sent"))
    } catch (requestError) {
      const retryAfter = authErrorRetryAfter(requestError)
      if (retryAfter) cooldown.start(retryAfter)
      const message = normalizeAuthError(requestError)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  async function resendCode() {
    setError("")
    if (!normalizedEmail || cooldown.remainingSeconds > 0) return

    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "sign-in",
      })
      if (result.error) throw result.error
      cooldown.start()
      toast.success(formatMessage("auth.otp.sent"))
    } catch (requestError) {
      const retryAfter = authErrorRetryAfter(requestError)
      if (retryAfter) cooldown.start(retryAfter)
      const message = normalizeAuthError(requestError)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode() {
    const nextCode = code.trim()
    setError("")
    if (nextCode.length !== 6) {
      setError(formatMessage("auth.otp.incompleteCode"))
      return
    }

    setLoading(true)
    try {
      const result = await authClient.signIn.emailOtp({ email: normalizedEmail, otp: nextCode })
      if (result.error) throw result.error
      props.onSignedIn()
      setStep("success")
      toast.success(formatMessage("auth.signedIn"))
    } catch (requestError) {
      const message = normalizeAuthError(requestError)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AuthBrand />

      {step === "email" ? (
        <>
          <DialogHeader className="mt-0 gap-1 text-left">
            <DialogTitle className="text-lg">{formatMessage("auth.signIn")}</DialogTitle>
            <DialogDescription className="leading-6">{formatMessage("auth.description.signIn")}</DialogDescription>
          </DialogHeader>
          <EmailCodeForm
            className="grid gap-2"
            emailInputId="auth-dialog-email"
            email={email}
            error={error}
            loading={loading}
            cooldown={cooldown}
            onEmailChange={setEmail}
            onSubmit={() => void sendCode()}
          />
        </>
      ) : null}

      {step === "code" ? (
        <>
          <DialogHeader className="mt-0 gap-1 text-left">
            <DialogTitle className="text-lg">{formatMessage("auth.otp.checkEmail")}</DialogTitle>
            <DialogDescription className="leading-6">
              {formatMessage("auth.otp.description", { email: normalizedEmail })}
            </DialogDescription>
          </DialogHeader>
          <OtpCodeForm
            className="grid gap-3"
            codeInputId="auth-dialog-code"
            code={code}
            error={error}
            loading={loading}
            cooldown={cooldown}
            onCodeChange={setCode}
            onResendCode={() => void resendCode()}
            onVerifyCode={() => void verifyCode()}
            onChangeEmail={() => {
              setStep("email")
              setError("")
            }}
          />
        </>
      ) : null}

      {step === "success" ? <SignInSuccess onDone={props.onDone} /> : null}
    </>
  )
}

export function SignInDialog(
  props: Readonly<{
    className?: string
    onCompleted?: () => void
  }>,
) {
  const [open, setOpen] = useState(false)
  const completedRef = useRef(false)

  function refetchAfterCompletion() {
    if (!completedRef.current) return
    completedRef.current = false
    props.onCompleted?.()
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) refetchAfterCompletion()
  }

  function closeAfterSuccess() {
    refetchAfterCompletion()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={[
            "h-8 border-border bg-background px-2.5 text-xs font-medium shadow-none hover:bg-muted",
            props.className ?? "",
          ].join(" ")}
        >
          <UserRoundIcon className="size-3.5" />
          {formatMessage("auth.signIn")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-popover shadow-none sm:max-w-sm">
        <SignInDialogContent
          onDone={closeAfterSuccess}
          onSignedIn={() => {
            completedRef.current = true
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

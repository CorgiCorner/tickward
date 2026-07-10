import { toNextJsHandler } from "better-auth/next-js"
import { NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api-error-response"
import { auditRequestContext, recordAuditEvent } from "@/lib/audit-log.server"
import { enforceEmailOtpSendRateLimit, isEmailOtpSendRequest } from "@/lib/auth/email-otp-rate-limit.server"
import { getTickwardAuth } from "@/lib/auth/auth.server"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"

export const runtime = "nodejs"

function unavailable() {
  return apiErrorResponse(PUBLIC_ERROR_CODES.authNotConfigured, "errors.authNotConfigured", { status: 501 })
}

function handlers() {
  try {
    const auth = getTickwardAuth()
    return auth ? toNextJsHandler(auth) : null
  } catch {
    return null
  }
}

function isSessionRead(req: Request) {
  return new URL(req.url).pathname.endsWith("/api/auth/get-session")
}

function authPath(req: Request) {
  const pathname = new URL(req.url).pathname
  const prefixIndex = pathname.indexOf("/api/auth")
  if (prefixIndex < 0) return pathname
  return pathname.slice(prefixIndex + "/api/auth".length) || "/"
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function roleValue(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
  return null
}

async function auditActor(req: Request) {
  try {
    const auth = getTickwardAuth()
    const session = await auth?.api.getSession({ headers: req.headers })
    const user = session?.user as Record<string, unknown> | undefined
    return {
      actorEmail: stringValue(user?.email),
      actorId: stringValue(user?.id),
    }
  } catch {
    return { actorEmail: null, actorId: null }
  }
}

async function readAuditJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.clone().json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function isSuccessful(res: Response) {
  return res.status >= 200 && res.status < 300
}

function isOtpVerificationPath(path: string) {
  return (
    path === "/sign-in/email-otp" ||
    path === "/email-otp/check-verification-otp" ||
    path === "/email-otp/verify-email" ||
    path === "/email-otp/reset-password" ||
    path === "/email-otp/change-email"
  )
}

function otpTypeForPath(path: string, body: Record<string, unknown> | null) {
  if (path === "/sign-in/email-otp") return "sign-in"
  if (path === "/email-otp/reset-password") return "forget-password"
  if (path === "/email-otp/change-email") return "change-email"
  return stringValue(body?.type) ?? "email-verification"
}

async function recordAuthPostAuditEvent(
  req: Request,
  res: Response,
  bodyPromise: Promise<Record<string, unknown> | null>,
) {
  const path = authPath(req)
  const body = await bodyPromise
  const { ip, userAgent } = auditRequestContext(req)

  if (!isSuccessful(res)) {
    if (!isOtpVerificationPath(path)) return
    const email = stringValue(body?.email)
    recordAuditEvent({
      action: "auth.otp.failed",
      actorEmail: email,
      ip,
      metadata: { path, type: otpTypeForPath(path, body) },
      targetType: "auth_otp",
      userAgent,
    })
    return
  }

  const userId = stringValue(body?.userId)
  const actor = await auditActor(req)
  if (path === "/admin/ban-user") {
    recordAuditEvent({
      action: "admin.user.banned",
      actorEmail: actor.actorEmail,
      actorId: actor.actorId,
      ip,
      metadata: {
        ban_expires_in_seconds: typeof body?.banExpiresIn === "number" ? body.banExpiresIn : null,
        has_reason: stringValue(body?.banReason) !== null,
      },
      targetId: userId,
      targetType: "user",
      userAgent,
    })
    return
  }

  if (path === "/admin/unban-user") {
    recordAuditEvent({
      action: "admin.user.unbanned",
      actorEmail: actor.actorEmail,
      actorId: actor.actorId,
      ip,
      targetId: userId,
      targetType: "user",
      userAgent,
    })
    return
  }

  if (path === "/admin/set-role") {
    recordAuditEvent({
      action: "admin.user.role_changed",
      actorEmail: actor.actorEmail,
      actorId: actor.actorId,
      ip,
      metadata: { role: roleValue(body?.role) },
      targetId: userId,
      targetType: "user",
      userAgent,
    })
    return
  }

  if (path === "/admin/impersonate-user") {
    recordAuditEvent({
      action: "admin.impersonation.started",
      actorEmail: actor.actorEmail,
      actorId: actor.actorId,
      ip,
      targetId: userId,
      targetType: "user",
      userAgent,
    })
  }
}

export async function GET(req: Request) {
  const handler = handlers()?.GET
  if (handler) return handler(req)
  if (isSessionRead(req)) return NextResponse.json(null)
  return unavailable()
}

export async function POST(req: Request) {
  const handler = handlers()?.POST
  if (!handler) return unavailable()
  if (isEmailOtpSendRequest(req)) {
    const rateLimitResponse = await enforceEmailOtpSendRateLimit(req)
    if (rateLimitResponse) return rateLimitResponse
  }
  const auditBody = readAuditJson(req)
  const res = await handler(req)
  void recordAuthPostAuditEvent(req, res, auditBody).catch((err: unknown) => {
    console.error("[tickward] audit.write", err)
  })
  return res
}

export async function PATCH(req: Request) {
  return handlers()?.PATCH(req) ?? unavailable()
}

export async function PUT(req: Request) {
  return handlers()?.PUT(req) ?? unavailable()
}

export async function DELETE(req: Request) {
  return handlers()?.DELETE(req) ?? unavailable()
}

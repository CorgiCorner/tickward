import "server-only"

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { admin, emailOTP } from "better-auth/plugins"

import { auditRequestContext, recordAuditEvent } from "@/lib/audit-log.server"
import { appAccessControl, appAccessRoles } from "@/lib/auth/access-control"
import { assertEmailOtpProviderConfigured, sendEmailOtpMessage } from "@/lib/auth/email-otp.server"
import { runInBackground } from "@/lib/background-task"
import { getPrismaClient } from "@/lib/db/prisma.server"
import { getBetterAuthConfig } from "@/lib/private-config.server"

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function auditActorFromAuthContext(context: unknown) {
  const session = (context as { context?: { session?: { user?: Record<string, unknown> } } } | null)?.context?.session
  const user = session?.user
  return {
    email: stringValue(user?.email),
    id: stringValue(user?.id),
  }
}

function sendEmailOtpWithoutTimingSignal(
  data: Parameters<typeof sendEmailOtpMessage>[0],
  requestContext = { ip: null, userAgent: null } as ReturnType<typeof auditRequestContext>,
) {
  assertEmailOtpProviderConfigured()
  recordAuditEvent({
    action: "auth.otp.sent",
    actorEmail: data.email,
    ip: requestContext.ip,
    metadata: { email: data.email, type: data.type },
    targetType: "auth_otp",
    userAgent: requestContext.userAgent,
  })
  runInBackground("auth.emailOtpDelivery", sendEmailOtpMessage(data))
}

function createTickwardAuth(args: {
  authConfig: NonNullable<ReturnType<typeof getBetterAuthConfig>>
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>
}) {
  const secureCookies = process.env.NODE_ENV === "production"

  return betterAuth({
    baseURL: args.authConfig.url,
    secret: args.authConfig.secret,
    database: prismaAdapter(args.prisma, {
      provider: "postgresql",
    }),
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
      },
    },
    databaseHooks: {
      session: {
        create: {
          async after(session) {
            if (stringValue(session.impersonatedBy)) return
            recordAuditEvent({
              action: "auth.signin.success",
              actorId: stringValue(session.userId),
              ip: stringValue(session.ipAddress),
              targetId: stringValue(session.id),
              targetType: "session",
              userAgent: stringValue(session.userAgent),
            })
          },
        },
        delete: {
          async after(session, context) {
            const actor = auditActorFromAuthContext(context)
            const subjectUserId = stringValue(session.userId)
            recordAuditEvent({
              action: "auth.session.revoked",
              actorEmail: actor.email,
              actorId: actor.id ?? subjectUserId,
              ip: stringValue(session.ipAddress),
              metadata: actor.id && actor.id !== subjectUserId ? { subject_user_id: subjectUserId } : null,
              targetId: stringValue(session.id),
              targetType: "session",
              userAgent: stringValue(session.userAgent),
            })
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP(data, ctx) {
          sendEmailOtpWithoutTimingSignal(data, ctx?.headers ? auditRequestContext(ctx.headers) : undefined)
        },
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        ac: appAccessControl,
        roles: appAccessRoles,
      }),
    ],
    experimental: {
      joins: true,
    },
  })
}

type TickwardAuth = ReturnType<typeof createTickwardAuth>

let cachedAuth: TickwardAuth | null | undefined

export function getTickwardAuth(): TickwardAuth | null {
  if (cachedAuth !== undefined) return cachedAuth

  const authConfig = getBetterAuthConfig()
  const prisma = getPrismaClient()
  if (!authConfig || !prisma) {
    cachedAuth = null
    return cachedAuth
  }

  cachedAuth = createTickwardAuth({ authConfig, prisma })

  return cachedAuth
}

export function resetTickwardAuthForTests() {
  cachedAuth = undefined
}

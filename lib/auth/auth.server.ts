import "server-only"

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { admin, emailOTP } from "better-auth/plugins"

import { appAccessControl, appAccessRoles } from "@/lib/auth/access-control"
import { assertEmailOtpProviderConfigured, sendEmailOtpMessage } from "@/lib/auth/email-otp.server"
import { getPrismaClient } from "@/lib/db/prisma.server"
import { getBetterAuthConfig } from "@/lib/private-config.server"

function sendEmailOtpWithoutTimingSignal(data: Parameters<typeof sendEmailOtpMessage>[0]) {
  assertEmailOtpProviderConfigured()
  void sendEmailOtpMessage(data).catch((error: unknown) => {
    console.error("[tickward] auth.emailOtpDelivery", error)
  })
}

function createTickwardAuth(args: {
  authConfig: NonNullable<ReturnType<typeof getBetterAuthConfig>>
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>
}) {
  return betterAuth({
    baseURL: args.authConfig.url,
    secret: args.authConfig.secret,
    database: prismaAdapter(args.prisma, {
      provider: "postgresql",
    }),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        overrideDefaultEmailVerification: true,
        rateLimit: {
          window: 60,
          max: 1,
        },
        async sendVerificationOTP(data) {
          sendEmailOtpWithoutTimingSignal(data)
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

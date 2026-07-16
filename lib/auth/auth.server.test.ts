import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  admin: vi.fn((options) => ({ id: "admin", options })),
  assertEmailOtpProviderConfigured: vi.fn(),
  betterAuth: vi.fn((options) => ({ options })),
  createAccessControl: vi.fn((statements) => ({
    statements,
    newRole: vi.fn((role) => ({
      authorize: vi.fn(() => ({ success: true })),
      role,
    })),
  })),
  emailOTP: vi.fn((options) => ({ id: "emailOTP", options })),
  getBetterAuthConfig: vi.fn(),
  getPrismaClient: vi.fn(),
  prismaAdapter: vi.fn(() => ({ id: "prisma-adapter" })),
  recordEmailOtpDeliveryFailure: vi.fn(),
  recordAuditEvent: vi.fn(),
  sendEmailOtpMessage: vi.fn(),
}))

vi.mock("@/lib/audit-log.server", () => ({
  auditRequestContext: (input: Request | Headers) => {
    const headers = input instanceof Request ? input.headers : input
    return {
      ip: headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? null,
      userAgent: headers.get("user-agent")?.trim() ?? null,
    }
  },
  recordAuditEvent: mocks.recordAuditEvent,
}))

vi.mock("better-auth", () => ({
  betterAuth: mocks.betterAuth,
}))

vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: mocks.prismaAdapter,
}))

vi.mock("better-auth/plugins", () => ({
  admin: mocks.admin,
  createAccessControl: mocks.createAccessControl,
  emailOTP: mocks.emailOTP,
}))

vi.mock("@/lib/db/prisma.server", () => ({
  getPrismaClient: mocks.getPrismaClient,
}))

vi.mock("@/lib/private-config.server", () => ({
  getBetterAuthConfig: mocks.getBetterAuthConfig,
}))

vi.mock("@/lib/auth/email-otp.server", () => ({
  assertEmailOtpProviderConfigured: mocks.assertEmailOtpProviderConfigured,
  sendEmailOtpMessage: mocks.sendEmailOtpMessage,
}))

vi.mock("@/lib/auth/email-otp-delivery-context.server", () => ({
  recordEmailOtpDeliveryFailure: mocks.recordEmailOtpDeliveryFailure,
}))

async function loadAuth() {
  vi.resetModules()
  const mod = await import("./auth.server")
  const auth = mod.getTickwardAuth()
  const authOptions = mocks.betterAuth.mock.calls[0]?.[0]
  const emailOtpPlugin = mocks.emailOTP.mock.calls[0]?.[0]
  return { auth, authOptions, emailOtpPlugin }
}

describe("tickward Better Auth server config", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mocks.admin.mockClear()
    mocks.assertEmailOtpProviderConfigured.mockReset()
    mocks.betterAuth.mockClear()
    mocks.createAccessControl.mockClear()
    mocks.emailOTP.mockClear()
    mocks.getBetterAuthConfig.mockReset()
    mocks.getPrismaClient.mockReset()
    mocks.prismaAdapter.mockClear()
    mocks.recordEmailOtpDeliveryFailure.mockReset()
    mocks.recordAuditEvent.mockReset()
    mocks.sendEmailOtpMessage.mockReset()
    mocks.getBetterAuthConfig.mockReturnValue({ url: "https://tickward.test", secret: "secret" })
    mocks.getPrismaClient.mockReturnValue({ prisma: true })
    mocks.sendEmailOtpMessage.mockResolvedValue(undefined)
  })

  it("configures Email OTP and Admin plugins without social providers", async () => {
    const { auth, emailOtpPlugin } = await loadAuth()

    expect(auth).toBeTruthy()
    expect(mocks.emailOTP).toHaveBeenCalledWith(
      expect.objectContaining({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        storeOTP: "hashed",
        overrideDefaultEmailVerification: true,
      }),
    )
    expect(emailOtpPlugin).not.toHaveProperty("rateLimit")
    expect(mocks.admin).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
    )
    expect(mocks.betterAuth).toHaveBeenCalledWith(expect.not.objectContaining({ socialProviders: expect.anything() }))
  })

  it("pins session lifetime and cookie attributes", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const { auth } = await loadAuth()

    expect(auth?.options).toEqual(
      expect.objectContaining({
        session: {
          expiresIn: 60 * 60 * 24 * 30,
          updateAge: 60 * 60 * 24,
        },
        advanced: {
          useSecureCookies: false,
          defaultCookieAttributes: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
          },
        },
      }),
    )

    vi.stubEnv("NODE_ENV", "production")
    const { auth: productionAuth } = await loadAuth()

    expect(productionAuth?.options.advanced).toEqual({
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
    })
  })

  it("fails closed before OTP dispatch when the mail provider is unavailable", async () => {
    const { emailOtpPlugin } = await loadAuth()
    mocks.assertEmailOtpProviderConfigured.mockImplementation(() => {
      throw new Error("Email sign-in is not configured.")
    })

    await expect(
      emailOtpPlugin.sendVerificationOTP({ email: "ada@example.com", otp: "123456", type: "sign-in" }),
    ).rejects.toThrow("Email sign-in is not configured.")
    expect(mocks.sendEmailOtpMessage).not.toHaveBeenCalled()
    expect(mocks.recordEmailOtpDeliveryFailure).toHaveBeenCalledOnce()
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled()
  })

  it("audits OTP sends without logging the OTP code", async () => {
    const { emailOtpPlugin } = await loadAuth()

    await emailOtpPlugin.sendVerificationOTP(
      { email: "ada@example.com", otp: "123456", type: "sign-in" },
      { headers: new Headers({ "user-agent": "Test Browser", "x-forwarded-for": "203.0.113.10, 10.0.0.1" }) },
    )

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "auth.otp.sent",
      actorEmail: "ada@example.com",
      ip: "203.0.113.10",
      metadata: { email: "ada@example.com", type: "sign-in" },
      targetType: "auth_otp",
      userAgent: "Test Browser",
    })
    expect(JSON.stringify(mocks.recordAuditEvent.mock.calls[0]?.[0])).not.toContain("123456")
  })

  it("audits session creation and revocation through database hooks", async () => {
    const { authOptions } = await loadAuth()

    await authOptions.databaseHooks.session.create.after({
      id: "session_123",
      ipAddress: "203.0.113.10",
      userAgent: "Test Browser",
      userId: "user_123",
    })
    await authOptions.databaseHooks.session.delete.after({
      id: "session_123",
      ipAddress: "203.0.113.10",
      userAgent: "Test Browser",
      userId: "user_123",
    })

    expect(mocks.recordAuditEvent).toHaveBeenNthCalledWith(1, {
      action: "auth.signin.success",
      actorId: "user_123",
      ip: "203.0.113.10",
      targetId: "session_123",
      targetType: "session",
      userAgent: "Test Browser",
    })
    expect(mocks.recordAuditEvent).toHaveBeenNthCalledWith(2, {
      action: "auth.session.revoked",
      actorEmail: null,
      actorId: "user_123",
      ip: "203.0.113.10",
      metadata: null,
      targetId: "session_123",
      targetType: "session",
      userAgent: "Test Browser",
    })
  })

  it("awaits OTP email delivery before reporting success", async () => {
    const { emailOtpPlugin } = await loadAuth()
    let resolveDelivery: (() => void) | undefined
    mocks.sendEmailOtpMessage.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelivery = resolve
      }),
    )

    const send = emailOtpPlugin.sendVerificationOTP({
      email: "ada@example.com",
      otp: "123456",
      type: "sign-in",
    })

    await expect(Promise.race([send.then(() => "resolved"), Promise.resolve("pending")])).resolves.toBe("pending")
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled()

    resolveDelivery?.()
    await expect(send).resolves.toBeUndefined()
    expect(mocks.assertEmailOtpProviderConfigured).toHaveBeenCalled()
    expect(mocks.sendEmailOtpMessage).toHaveBeenCalledWith({
      email: "ada@example.com",
      otp: "123456",
      type: "sign-in",
    })
    expect(mocks.recordAuditEvent).toHaveBeenCalledOnce()
  })

  it("records OTP delivery failure and propagates a provider rejection", async () => {
    const { emailOtpPlugin } = await loadAuth()
    const providerError = new Error("provider rejected request: private detail")
    mocks.sendEmailOtpMessage.mockRejectedValue(providerError)

    await expect(
      emailOtpPlugin.sendVerificationOTP({
        email: "ada@example.com",
        otp: "123456",
        type: "sign-in",
      }),
    ).rejects.toBe(providerError)

    expect(mocks.recordEmailOtpDeliveryFailure).toHaveBeenCalledOnce()
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled()
  })
})

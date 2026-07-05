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
  sendEmailOtpMessage: vi.fn(),
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

async function loadAuth() {
  vi.resetModules()
  const mod = await import("./auth.server")
  const auth = mod.getTickwardAuth()
  const emailOtpPlugin = mocks.emailOTP.mock.calls[0]?.[0]
  return { auth, emailOtpPlugin }
}

describe("tickward Better Auth server config", () => {
  beforeEach(() => {
    mocks.admin.mockClear()
    mocks.assertEmailOtpProviderConfigured.mockReset()
    mocks.betterAuth.mockClear()
    mocks.createAccessControl.mockClear()
    mocks.emailOTP.mockClear()
    mocks.getBetterAuthConfig.mockReset()
    mocks.getPrismaClient.mockReset()
    mocks.prismaAdapter.mockClear()
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
        expiresIn: 300,
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

  it("fails closed before OTP dispatch when the mail provider is unavailable", async () => {
    const { emailOtpPlugin } = await loadAuth()
    mocks.assertEmailOtpProviderConfigured.mockImplementation(() => {
      throw new Error("Email sign-in is not configured.")
    })

    await expect(
      emailOtpPlugin.sendVerificationOTP({ email: "ada@example.com", otp: "123456", type: "sign-in" }),
    ).rejects.toThrow("Email sign-in is not configured.")
    expect(mocks.sendEmailOtpMessage).not.toHaveBeenCalled()
  })

  it("does not await OTP email delivery after the provider guard passes", async () => {
    const { emailOtpPlugin } = await loadAuth()
    mocks.sendEmailOtpMessage.mockReturnValue(new Promise(() => {}))

    await expect(
      Promise.race([
        emailOtpPlugin
          .sendVerificationOTP({ email: "ada@example.com", otp: "123456", type: "sign-in" })
          .then(() => "resolved"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
      ]),
    ).resolves.toBe("resolved")
    expect(mocks.assertEmailOtpProviderConfigured).toHaveBeenCalled()
    expect(mocks.sendEmailOtpMessage).toHaveBeenCalledWith({
      email: "ada@example.com",
      otp: "123456",
      type: "sign-in",
    })
  })
})

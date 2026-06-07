import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  sendEmailOtp: vi.fn(),
}))

vi.mock("@/lib/server-adapters.server", () => ({
  getServerAdapters: () => ({
    mailProvider: {
      id: "test-mail",
      isConfigured: mocks.isConfigured,
      sendTimerFinishedEmail: vi.fn(),
      sendEmailOtp: mocks.sendEmailOtp,
    },
  }),
}))

import { sendEmailOtpMessage } from "@/lib/auth/email-otp.server"
import { assertEmailOtpProviderConfigured } from "@/lib/auth/email-otp.server"

describe("email OTP delivery", () => {
  beforeEach(() => {
    mocks.isConfigured.mockReset()
    mocks.isConfigured.mockReturnValue(true)
    mocks.sendEmailOtp.mockReset()
  })

  it("delegates OTP delivery to the configured mail provider", async () => {
    await sendEmailOtpMessage({
      email: "ada@example.com",
      otp: "123456",
      type: "sign-in",
    })

    expect(mocks.sendEmailOtp).toHaveBeenCalledWith({
      to: "ada@example.com",
      otp: "123456",
      type: "sign-in",
    })
  })

  it("exposes a synchronous configured-provider guard for auth callbacks", () => {
    expect(() => assertEmailOtpProviderConfigured()).not.toThrow()

    mocks.isConfigured.mockReturnValue(false)

    expect(() => assertEmailOtpProviderConfigured()).toThrow("Email sign-in is not configured.")
  })

  it("fails OTP delivery when no mail provider is configured", async () => {
    mocks.isConfigured.mockReturnValue(false)

    await expect(
      sendEmailOtpMessage({
        email: "ada@example.com",
        otp: "123456",
        type: "sign-in",
      }),
    ).rejects.toThrow("Email sign-in is not configured.")

    expect(mocks.sendEmailOtp).not.toHaveBeenCalled()
  })
})

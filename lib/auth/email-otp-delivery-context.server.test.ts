import { describe, expect, it } from "vitest"

import { recordEmailOtpDeliveryFailure, trackEmailOtpDelivery } from "@/lib/auth/email-otp-delivery-context.server"

describe("email OTP delivery context", () => {
  it("tracks delivery failures inside the current async request", async () => {
    const result = await trackEmailOtpDelivery(async () => {
      await Promise.resolve()
      recordEmailOtpDeliveryFailure()
      return "response"
    })

    expect(result).toEqual({ deliveryFailed: true, value: "response" })
  })

  it("keeps concurrent request results isolated", async () => {
    const [failed, successful] = await Promise.all([
      trackEmailOtpDelivery(async () => {
        await Promise.resolve()
        recordEmailOtpDeliveryFailure()
        return "failed"
      }),
      trackEmailOtpDelivery(async () => {
        await Promise.resolve()
        return "successful"
      }),
    ])

    expect(failed.deliveryFailed).toBe(true)
    expect(successful.deliveryFailed).toBe(false)
  })
})

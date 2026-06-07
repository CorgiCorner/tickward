import { describe, expect, it } from "vitest"

import { DEFAULT_NOTIFICATION_PRESENTATION } from "./notification-preferences"
import { nullNotificationDeliveryProvider, type TimerFinishedDeliveryCommand } from "./notification-delivery"

describe("notification delivery provider", () => {
  it("null provider skips all requested channels", async () => {
    const command: TimerFinishedDeliveryCommand = {
      transactionId: "timer_123:2026-05-25T12:00:00.000Z",
      workflowIdentifier: "timer.finished",
      timerId: "timer_123",
      label: "Launch",
      targetDate: "2026-05-25T12:00:00.000Z",
      timezone: "Europe/Warsaw",
      channels: ["email", "sms", "push", "chat"],
      presentation: DEFAULT_NOTIFICATION_PRESENTATION,
      recipient: {
        email: "ada@example.com",
        phoneNumber: "+15551234567",
        pushSubscriptionIds: ["push_123"],
        chatConnectionIds: ["slack_conn_123"],
      },
    }

    await expect(nullNotificationDeliveryProvider.sendTimerFinished(command)).resolves.toEqual([
      { channel: "email", status: "skipped", reason: "provider_not_configured", providerId: "none" },
      { channel: "sms", status: "skipped", reason: "provider_not_configured", providerId: "none" },
      { channel: "push", status: "skipped", reason: "provider_not_configured", providerId: "none" },
      { channel: "chat", status: "skipped", reason: "provider_not_configured", providerId: "none" },
    ])
  })
})

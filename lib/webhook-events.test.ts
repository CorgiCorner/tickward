import { describe, expect, it } from "vitest"

import {
  WEBHOOK_EVENT_VERSION,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_TEST_EVENT_TYPE,
  normalizeWebhookEventTypes,
  webhookEndpointUrlSchema,
  webhookEventPayloadSchema,
} from "@/lib/webhook-events"

describe("webhook events v1 contract", () => {
  it("keeps the public event type set explicit", () => {
    expect(WEBHOOK_EVENT_TYPES).toEqual([
      "project.created",
      "project.updated",
      "project.deleted",
      "timer.created",
      "timer.updated",
      "timer.archived",
      "timer.restored",
      "timer.deleted",
      "timer.ended",
      "timer.milestone",
      "share.created",
      "share.deleted",
    ])
  })

  it("validates the delivered webhook payload shape", () => {
    expect(
      webhookEventPayloadSchema.parse({
        object: "event",
        id: "evt_123",
        type: "timer.ended",
        created: "2026-06-09T09:00:00.000Z",
        environment: "production",
        event_version: WEBHOOK_EVENT_VERSION,
        data: {
          object: {
            id: "timer_123",
            object: "timer",
            project_id: "project_123",
            project_name: "Main",
            timer_id: "timer_123",
            timer_label: "Renewal",
          },
        },
      }),
    ).toMatchObject({
      object: "event",
      type: "timer.ended",
      environment: "production",
      event_version: WEBHOOK_EVENT_VERSION,
      data: { object: { object: "timer", timer_label: "Renewal" } },
    })
  })

  it("allows the test delivery event without adding it to subscribable events", () => {
    expect(WEBHOOK_EVENT_TYPES).not.toContain(WEBHOOK_TEST_EVENT_TYPE)
    expect(
      webhookEventPayloadSchema.parse({
        object: "event",
        id: "evt_test",
        type: WEBHOOK_TEST_EVENT_TYPE,
        created: "2026-06-09T09:00:00.000Z",
        environment: "development",
        event_version: WEBHOOK_EVENT_VERSION,
        data: {
          object: {
            id: "wh_123",
            object: "webhook_endpoint",
            message: "Test webhook delivery.",
          },
        },
      }),
    ).toMatchObject({ type: WEBHOOK_TEST_EVENT_TYPE })
  })

  it("normalizes event subscriptions without leaking invalid values", () => {
    expect(normalizeWebhookEventTypes(["timer.created", "timer.created", "unknown"])).toEqual(["timer.created"])
  })

  it("requires HTTPS except for local development URLs", () => {
    expect(webhookEndpointUrlSchema.safeParse("https://example.com/webhooks").success).toBe(true)
    expect(webhookEndpointUrlSchema.safeParse("http://localhost:4000/webhooks").success).toBe(true)
    expect(webhookEndpointUrlSchema.safeParse("http://example.com/webhooks").success).toBe(false)
  })
})

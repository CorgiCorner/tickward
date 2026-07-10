import { createHmac } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { WEBHOOK_EVENT_VERSION } from "@/lib/webhook-events"
import {
  WebhookEndpointLimitError,
  createWebhookDeliveryPayload,
  createWebhookEndpointForUser,
  deliverDueWebhooks,
  isUnsafeWebhookAddress,
  isUnsafeWebhookHostname,
  removeWebhookEndpointForUser,
  signWebhookPayload,
  webhookAutoDisableFailureThreshold,
  webhookMaxEndpointsPerUser,
} from "@/lib/webhooks.server"

const prismaMocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

const auditMocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
}))

const mailMocks = vi.hoisted(() => ({
  sendWebhookEndpointDisabledEmail: vi.fn(),
}))

vi.mock("@/lib/audit-log.server", () => ({
  recordAuditEvent: auditMocks.recordAuditEvent,
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: prismaMocks.requirePrismaClient,
}))

vi.mock("@/lib/server-adapters.server", () => ({
  getServerAdapters: () => ({
    mailProvider: {
      id: "test",
      isConfigured: () => true,
      sendEmailOtp: vi.fn(),
      sendTimerFinishedEmail: vi.fn(),
      sendTimerReminderEmail: vi.fn(),
      sendWebhookEndpointDisabledEmail: mailMocks.sendWebhookEndpointDisabledEmail,
    },
  }),
}))

describe("webhook signing", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("uses timestamp-prefixed HMAC SHA-256 signatures", () => {
    const payload = JSON.stringify({ id: "evt_123", type: "timer.ended" })
    const timestamp = 1_780_000_000
    const expected = createHmac("sha256", "test_signing_secret").update(`${timestamp}.${payload}`, "utf8").digest("hex")

    expect(signWebhookPayload("test_signing_secret", payload, timestamp)).toBe(`t=${timestamp},v1=${expected}`)
  })

  it("classifies private webhook network targets before delivery", () => {
    expect(isUnsafeWebhookHostname("localhost")).toBe(true)
    expect(isUnsafeWebhookHostname("hooks.example.com")).toBe(false)
    expect(isUnsafeWebhookAddress("127.0.0.1")).toBe(true)
    expect(isUnsafeWebhookAddress("10.0.0.12")).toBe(true)
    expect(isUnsafeWebhookAddress("172.20.0.12")).toBe(true)
    expect(isUnsafeWebhookAddress("192.168.1.10")).toBe(true)
    expect(isUnsafeWebhookAddress("169.254.1.10")).toBe(true)
    expect(isUnsafeWebhookAddress("8.8.8.8")).toBe(false)
  })

  it("builds versioned event envelopes with a data.object payload", () => {
    vi.stubEnv("TICKWARD_ENVIRONMENT", "Staging")

    expect(
      createWebhookDeliveryPayload({
        aggregateId: "timer_123",
        aggregateType: "timer",
        id: "evt_123",
        occurredAt: new Date("2026-06-09T09:00:00.000Z"),
        payload: {
          aggregate_id: "legacy_timer_123",
          aggregate_type: "legacy_timer",
          project_id: "project_123",
          project_name: "Main",
          timer_id: "timer_123",
          timer_label: "Renewal",
        },
        projectId: "project_123",
        shareId: null,
        timerId: "timer_123",
        type: "timer.ended",
      }),
    ).toEqual({
      object: "event",
      id: "evt_123",
      type: "timer.ended",
      created: "2026-06-09T09:00:00.000Z",
      environment: "staging",
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
    })
  })
})

describe("webhook abuse protections", () => {
  afterEach(() => {
    auditMocks.recordAuditEvent.mockReset()
    prismaMocks.requirePrismaClient.mockReset()
    mailMocks.sendWebhookEndpointDisabledEmail.mockReset()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("reads endpoint and failure limits from the environment with safe fallbacks", () => {
    expect(webhookMaxEndpointsPerUser()).toBe(3)
    expect(webhookAutoDisableFailureThreshold()).toBe(25)

    vi.stubEnv("TICKWARD_WEBHOOK_MAX_ENDPOINTS", "10")
    vi.stubEnv("TICKWARD_WEBHOOK_AUTO_DISABLE_FAILURES", "50")
    expect(webhookMaxEndpointsPerUser()).toBe(10)
    expect(webhookAutoDisableFailureThreshold()).toBe(50)

    vi.stubEnv("TICKWARD_WEBHOOK_MAX_ENDPOINTS", "not-a-number")
    vi.stubEnv("TICKWARD_WEBHOOK_AUTO_DISABLE_FAILURES", "-1")
    expect(webhookMaxEndpointsPerUser()).toBe(3)
    expect(webhookAutoDisableFailureThreshold()).toBe(25)
  })

  it("rejects new endpoints once the active endpoint limit is reached", async () => {
    const create = vi.fn()
    prismaMocks.requirePrismaClient.mockReturnValue({
      webhookEndpoint: {
        count: vi.fn().mockResolvedValue(webhookMaxEndpointsPerUser()),
        create,
      },
    })

    await expect(
      createWebhookEndpointForUser({
        name: "Production",
        url: "https://8.8.8.8/tickward",
        user: { id: "user_123" },
      }),
    ).rejects.toBeInstanceOf(WebhookEndpointLimitError)
    expect(create).not.toHaveBeenCalled()
  })

  it("emits an audit event when an endpoint is created", async () => {
    const createdAt = new Date("2026-06-10T09:00:00.000Z")
    prismaMocks.requirePrismaClient.mockReturnValue({
      webhookEndpoint: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({
          createdAt,
          disabledAt: null,
          eventTypes: ["timer.ended"],
          failureCount: 0,
          id: "wh_123",
          lastDeliveredAt: null,
          lastFailedAt: null,
          name: "Production",
          secret: "whsec_secret",
          status: "active",
          updatedAt: createdAt,
          url: "https://8.8.8.8/tickward",
        }),
      },
    })

    const result = await createWebhookEndpointForUser({
      eventTypes: ["timer.ended"],
      name: "Production",
      url: "https://8.8.8.8/tickward",
      user: { email: "ada@example.com", id: "user_123" },
    })

    expect(result).toMatchObject({ id: "wh_123" })
    expect(result.signing_secret).toMatch(/^whsec_/)

    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "webhook.created",
      actorEmail: "ada@example.com",
      actorId: "user_123",
      metadata: {
        event_types: ["timer.ended"],
        name: "Production",
        status: "active",
        url: "https://8.8.8.8/tickward",
      },
      targetId: "wh_123",
      targetType: "webhook_endpoint",
    })
    expect(JSON.stringify(auditMocks.recordAuditEvent.mock.calls[0]?.[0])).not.toContain(result.signing_secret)
  })

  it("resets the failure streak when an endpoint is re-activated", async () => {
    const updateManyAndReturn = vi.fn().mockResolvedValue([])
    prismaMocks.requirePrismaClient.mockReturnValue({
      webhookEndpoint: { updateManyAndReturn },
    })
    const { updateWebhookEndpointForUser } = await import("@/lib/webhooks.server")

    await updateWebhookEndpointForUser({ id: "wh_123", status: "active", user: { id: "user_123" } })

    expect(updateManyAndReturn).toHaveBeenCalledWith({
      where: { id: "wh_123", userId: "user_123" },
      data: { status: "active", disabledAt: null, failureCount: 0 },
    })
  })

  it("updates endpoint event subscriptions by owner", async () => {
    const updatedAt = new Date("2026-06-10T09:00:00.000Z")
    const updateManyAndReturn = vi.fn().mockResolvedValue([
      {
        id: "wh_123",
        name: "Production",
        secret: "whsec_test",
        url: "https://example.com/tickward",
        eventTypes: ["timer.created", "timer.ended"],
        status: "active",
        failureCount: 0,
        createdAt: updatedAt,
        updatedAt,
        disabledAt: null,
        lastDeliveredAt: null,
        lastFailedAt: null,
      },
    ])
    prismaMocks.requirePrismaClient.mockReturnValue({
      webhookEndpoint: { updateManyAndReturn },
    })
    const { updateWebhookEndpointForUser } = await import("@/lib/webhooks.server")

    await expect(
      updateWebhookEndpointForUser({
        eventTypes: ["timer.created", "timer.ended"],
        id: "wh_123",
        user: { id: "user_123" },
      }),
    ).resolves.toMatchObject({ event_types: ["timer.created", "timer.ended"] })

    expect(updateManyAndReturn).toHaveBeenCalledWith({
      where: { id: "wh_123", userId: "user_123" },
      data: { eventTypes: ["timer.created", "timer.ended"] },
    })
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "webhook.updated",
      actorEmail: undefined,
      actorId: "user_123",
      metadata: {
        event_types: ["timer.created", "timer.ended"],
        name: "Production",
        status: "active",
        url: "https://example.com/tickward",
      },
      targetId: "wh_123",
      targetType: "webhook_endpoint",
    })
  })

  it("removes endpoints by owner", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 })
    prismaMocks.requirePrismaClient.mockReturnValue({
      webhookEndpoint: { deleteMany },
    })

    await expect(removeWebhookEndpointForUser({ id: "wh_123", user: { id: "user_123" } })).resolves.toBe(true)

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "wh_123", userId: "user_123" },
    })
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "webhook.deleted",
      actorEmail: undefined,
      actorId: "user_123",
      targetId: "wh_123",
      targetType: "webhook_endpoint",
    })
  })

  it("reports missing endpoints while removing", async () => {
    prismaMocks.requirePrismaClient.mockReturnValue({
      webhookEndpoint: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    })

    await expect(removeWebhookEndpointForUser({ id: "wh_123", user: { id: "user_123" } })).resolves.toBe(false)
  })

  it("auto-disables an endpoint past the consecutive failure threshold and emails the owner", async () => {
    const endpointUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const delivery = {
      id: "wd_123",
      attemptCount: webhookAutoDisableFailureThreshold(),
      endpointId: "wh_123",
      endpoint: {
        id: "wh_123",
        secret: "test_signing_secret",
        url: "https://8.8.8.8/tickward",
      },
      event: {
        aggregateId: "timer_123",
        aggregateType: "timer",
        id: "evt_123",
        occurredAt: new Date("2026-06-09T09:00:00.000Z"),
        payload: {},
        projectId: "project_123",
        shareId: null,
        timerId: "timer_123",
        type: "timer.ended",
      },
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: delivery.id }]),
      webhookDelivery: {
        findMany: vi.fn().mockResolvedValue([delivery]),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      webhookEndpoint: {
        findUnique: vi.fn().mockResolvedValue({
          failureCount: webhookAutoDisableFailureThreshold() + 1,
          id: "wh_123",
          name: "Production",
          url: "https://8.8.8.8/tickward",
          user: { email: "ada@example.com", id: "user_123" },
        }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: endpointUpdateMany,
      },
    }
    prismaMocks.requirePrismaClient.mockReturnValue({
      ...tx,
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function"
          ? (arg as (client: typeof tx) => unknown)(tx)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }))

    await deliverDueWebhooks(1)

    expect(endpointUpdateMany).toHaveBeenCalledWith({
      where: {
        failureCount: { gte: webhookAutoDisableFailureThreshold() },
        id: "wh_123",
        status: "active",
      },
      data: { disabledAt: expect.any(Date), status: "disabled" },
    })
    expect(mailMocks.sendWebhookEndpointDisabledEmail).toHaveBeenCalledWith({
      to: "ada@example.com",
      endpointId: "wh_123",
      endpointName: "Production",
      endpointUrl: "https://8.8.8.8/tickward",
      failureCount: webhookAutoDisableFailureThreshold() + 1,
    })
  })

  it("upgrades plaintext endpoint secrets after signing with a configured key", async () => {
    vi.stubEnv("TICKWARD_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"))
    const delivery = {
      id: "wd_123",
      attemptCount: 0,
      endpointId: "wh_123",
      endpoint: {
        id: "wh_123",
        secret: "whsec_plain_secret",
        url: "https://8.8.8.8/tickward",
      },
      event: {
        aggregateId: "timer_123",
        aggregateType: "timer",
        id: "evt_123",
        occurredAt: new Date("2026-06-09T09:00:00.000Z"),
        payload: {},
        projectId: "project_123",
        shareId: null,
        timerId: "timer_123",
        type: "timer.ended",
      },
    }
    const endpointUpdate = vi.fn().mockResolvedValue({})
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: delivery.id }]),
      webhookDelivery: {
        findMany: vi.fn().mockResolvedValue([delivery]),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      webhookEndpoint: {
        findUnique: vi.fn(),
        update: endpointUpdate,
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
    prismaMocks.requirePrismaClient.mockReturnValue({
      ...tx,
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function"
          ? (arg as (client: typeof tx) => unknown)(tx)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }))

    await deliverDueWebhooks(1)

    const secretUpgrade = endpointUpdate.mock.calls
      .map(([args]) => args)
      .find((args) => typeof args.data.secret === "string")
    expect(secretUpgrade).toEqual({
      where: { id: "wh_123" },
      data: { secret: expect.stringMatching(/^enc1:/) },
    })

    const fetchInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const signature = (fetchInit.headers as Record<string, string>)["tickward-signature"]
    const body = fetchInit.body as string
    const timestamp = Number.parseInt(signature.match(/^t=(\d+),v1=/)?.[1] ?? "", 10)
    const expected = createHmac("sha256", "whsec_plain_secret").update(`${timestamp}.${body}`, "utf8").digest("hex")

    expect(signature).toBe(`t=${timestamp},v1=${expected}`)
  })
})

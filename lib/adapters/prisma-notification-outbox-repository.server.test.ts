import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

function prismaMock() {
  return {
    notificationOutboxItem: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  }
}

describe("prisma notification outbox repository", () => {
  beforeEach(() => {
    mocks.requirePrismaClient.mockReset()
  })

  it("upserts notification workflow intents by transaction id", async () => {
    const { prismaNotificationOutboxRepository } = await import("./prisma-notification-outbox-repository.server")
    const prisma = prismaMock()
    prisma.notificationOutboxItem.upsert.mockResolvedValue({
      id: "outbox_123",
      transactionId: "timer-finished:timer_123:2026-06-05T12:00:00.000Z",
      workflowIdentifier: "timer.finished",
      subscriberId: "user_123",
      timerId: "timer_123",
      channels: ["email", "chat"],
      payload: { timerId: "timer_123", label: "Launch" },
      overrides: { chatConnectionId: "slack_conn_123" },
      status: "processing",
      scheduledFor: null,
      createdAt: new Date("2026-06-05T12:00:00.000Z"),
      updatedAt: new Date("2026-06-05T12:00:01.000Z"),
      processedAt: null,
      cancelledAt: null,
      failedAt: null,
      error: null,
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await expect(
      prismaNotificationOutboxRepository.upsertIntent({
        transactionId: "timer-finished:timer_123:2026-06-05T12:00:00.000Z",
        workflowIdentifier: "timer.finished",
        subscriberId: "user_123",
        timerId: "timer_123",
        channels: ["email", "chat"],
        payload: { timerId: "timer_123", label: "Launch" },
        overrides: { chatConnectionId: "slack_conn_123" },
        status: "processing",
      }),
    ).resolves.toMatchObject({
      id: "outbox_123",
      transactionId: "timer-finished:timer_123:2026-06-05T12:00:00.000Z",
      workflowIdentifier: "timer.finished",
      subscriberId: "user_123",
      channels: ["email", "chat"],
      payload: { timerId: "timer_123", label: "Launch" },
      overrides: { chatConnectionId: "slack_conn_123" },
      status: "processing",
    })

    expect(prisma.notificationOutboxItem.upsert).toHaveBeenCalledWith({
      where: { transactionId: "timer-finished:timer_123:2026-06-05T12:00:00.000Z" },
      update: expect.objectContaining({
        workflowIdentifier: "timer.finished",
        subscriberId: "user_123",
        channels: ["email", "chat"],
        payload: { timerId: "timer_123", label: "Launch" },
      }),
      create: expect.objectContaining({
        transactionId: "timer-finished:timer_123:2026-06-05T12:00:00.000Z",
        workflowIdentifier: "timer.finished",
        subscriberId: "user_123",
        channels: ["email", "chat"],
        payload: { timerId: "timer_123", label: "Launch" },
      }),
    })
  })

  it("marks intent delivery outcomes", async () => {
    const { prismaNotificationOutboxRepository } = await import("./prisma-notification-outbox-repository.server")
    const prisma = prismaMock()
    prisma.notificationOutboxItem.updateMany.mockResolvedValue({ count: 1 })
    mocks.requirePrismaClient.mockReturnValue(prisma)

    await prismaNotificationOutboxRepository.markIntentResult({
      transactionId: "timer-finished:timer_123:2026-06-05T12:00:00.000Z",
      status: "sent",
      occurredAt: "2026-06-05T12:00:01.000Z",
    })

    expect(prisma.notificationOutboxItem.updateMany).toHaveBeenCalledWith({
      where: { transactionId: "timer-finished:timer_123:2026-06-05T12:00:00.000Z" },
      data: {
        status: "sent",
        error: undefined,
        processedAt: new Date("2026-06-05T12:00:01.000Z"),
        failedAt: undefined,
        cancelledAt: undefined,
      },
    })
  })
})

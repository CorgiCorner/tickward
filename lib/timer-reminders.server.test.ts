import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeTimer } from "@/test/factories"

const mocks = vi.hoisted(() => ({
  notificationDeliveryProvider: { sendTimerReminder: vi.fn() },
  notificationDeliveryTracker: { trackDelivery: vi.fn() },
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

vi.mock("@/lib/server-adapters.server", () => ({
  getServerAdapters: () => ({
    notificationDeliveryProvider: mocks.notificationDeliveryProvider,
    notificationDeliveryTracker: mocks.notificationDeliveryTracker,
  }),
}))

function outboxTx() {
  return {
    notificationOutboxItem: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
}

function dueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "outbox_123",
    transactionId: "timer-reminder:project_123:timer-a:10m:2026-07-10T12:00:00.000Z",
    workflowIdentifier: "timer.reminder",
    subscriberId: "user_123",
    timerId: "timer-a",
    channels: ["in_app", "email"],
    payload: {
      projectId: "project_123",
      offsetMinutes: 10,
      occurrenceAt: "2026-07-10T12:00:00.000Z",
    },
    status: "scheduled",
    scheduledFor: new Date("2026-07-10T11:50:00.000Z"),
    ...overrides,
  }
}

function timerRow(overrides: Partial<ReturnType<typeof makeTimer>> = {}) {
  return {
    id: "timer-a",
    data: makeTimer({
      id: "timer-a",
      reminders: [{ offsetMinutes: 10 }],
      ...overrides,
    }),
    project: {
      id: "project_123",
      ownerId: "user_123",
      owner: {
        id: "user_123",
        email: "ada@example.com",
        preference: { emailReminders: false, inAppNotifications: true },
      },
    },
  }
}

function deliveryPrisma(
  args: {
    items?: Array<ReturnType<typeof dueItem>>
    lateSkipped?: number
    timer?: ReturnType<typeof timerRow> | null
    timerRows?: Array<ReturnType<typeof timerRow>>
    deliveryLogCounts?: number[]
  } = {},
) {
  const items = args.items ?? [dueItem()]
  const deliveryLogCounts = [...(args.deliveryLogCounts ?? [0, 0])]
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue(items.map((item) => ({ id: item.id }))),
    $transaction: vi.fn(async (callback: (client: typeof prisma) => Promise<unknown>) => callback(prisma)),
    notificationDeliveryLog: {
      count: vi.fn().mockImplementation(() => Promise.resolve(deliveryLogCounts.shift() ?? 0)),
    },
    notificationOutboxItem: {
      updateMany: vi
        .fn()
        .mockResolvedValueOnce({ count: args.lateSkipped ?? 0 })
        .mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue(items),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    timer: {
      findFirst: vi.fn().mockResolvedValue(args.timer === undefined ? timerRow() : args.timer),
      findMany: vi.fn().mockResolvedValue(args.timerRows ?? [timerRow()]),
    },
    inAppNotification: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }
  return prisma
}

describe("timer reminders", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-10T11:49:00.000Z"))
    vi.unstubAllEnvs()
    mocks.requirePrismaClient.mockReset()
    mocks.notificationDeliveryProvider.sendTimerReminder.mockReset()
    mocks.notificationDeliveryProvider.sendTimerReminder.mockResolvedValue([
      {
        channel: "in_app",
        status: "sent",
        providerId: "inbox",
        attemptCount: 1,
        successCount: 1,
        failureCount: 0,
      },
    ])
    mocks.notificationDeliveryTracker.trackDelivery.mockReset()
    mocks.notificationDeliveryTracker.trackDelivery.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("builds stable transaction ids", async () => {
    const { timerReminderTransactionId } = await import("./timer-reminders.server")

    expect(timerReminderTransactionId("project_123", "timer_123", 10, "2026-07-10T12:00:00.000Z")).toBe(
      "timer-reminder:project_123:timer_123:10m:2026-07-10T12:00:00.000Z",
    )
  })

  it("reconciles scheduled reminder intents for active owned timers", async () => {
    const tx = outboxTx()
    const { reconcileTimerReminders } = await import("./timer-reminders.server")

    await reconcileTimerReminders(tx as never, {
      project: { id: "project_123", ownerId: "user_123" },
      timer: makeTimer({
        id: "timer-a",
        targetDate: "2026-07-10T12:00:00.000Z",
        timezone: "UTC",
        reminders: [{ offsetMinutes: 10 }],
      }),
    })

    expect(tx.notificationOutboxItem.updateMany).toHaveBeenCalledWith({
      where: {
        timerId: "timer-a",
        workflowIdentifier: "timer.reminder",
        status: "scheduled",
        transactionId: { notIn: ["timer-reminder:project_123:timer-a:10m:2026-07-10T12:00:00.000Z"] },
        payload: { path: ["projectId"], equals: "project_123" },
      },
      data: { cancelledAt: expect.any(Date), status: "cancelled" },
    })
    expect(tx.notificationOutboxItem.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          transactionId: "timer-reminder:project_123:timer-a:10m:2026-07-10T12:00:00.000Z",
          workflowIdentifier: "timer.reminder",
          subscriberId: "user_123",
          timerId: "timer-a",
          scheduledFor: new Date("2026-07-10T11:50:00.000Z"),
          status: "scheduled",
        }),
      ],
    })
  })

  it("reactivates matching cancelled reminder intents without creating duplicates", async () => {
    const tx = outboxTx()
    tx.notificationOutboxItem.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    const { reconcileTimerReminders } = await import("./timer-reminders.server")

    await reconcileTimerReminders(tx as never, {
      project: { id: "project_123", ownerId: "user_123" },
      timer: makeTimer({
        id: "timer-a",
        targetDate: "2026-07-10T12:00:00.000Z",
        timezone: "UTC",
        reminders: [{ offsetMinutes: 10 }],
      }),
    })

    expect(tx.notificationOutboxItem.createMany).not.toHaveBeenCalled()
    expect(tx.notificationOutboxItem.updateMany).toHaveBeenLastCalledWith({
      where: {
        transactionId: "timer-reminder:project_123:timer-a:10m:2026-07-10T12:00:00.000Z",
        status: { in: ["scheduled", "cancelled"] },
      },
      data: expect.objectContaining({
        scheduledFor: new Date("2026-07-10T11:50:00.000Z"),
        status: "scheduled",
        cancelledAt: null,
      }),
    })
  })

  it.each([
    ["no owner", { ownerId: null, timer: makeTimer({ reminders: [{ offsetMinutes: 10 }] }) }],
    [
      "archived",
      {
        ownerId: "user_123",
        timer: makeTimer({ archivedAt: "2026-07-01T00:00:00.000Z", reminders: [{ offsetMinutes: 10 }] }),
      },
    ],
    ["no reminders", { ownerId: "user_123", timer: makeTimer({ reminders: [] }) }],
  ])("cancels scheduled reminder intents for %s timers", async (_label, input) => {
    const tx = outboxTx()
    const { reconcileTimerReminders } = await import("./timer-reminders.server")

    await reconcileTimerReminders(tx as never, {
      project: { id: "project_123", ownerId: input.ownerId },
      timer: input.timer,
    })

    expect(tx.notificationOutboxItem.updateMany).toHaveBeenCalledWith({
      where: {
        timerId: "timer-a",
        workflowIdentifier: "timer.reminder",
        status: "scheduled",
        payload: { path: ["projectId"], equals: "project_123" },
      },
      data: { cancelledAt: expect.any(Date), status: "cancelled" },
    })
    expect(tx.notificationOutboxItem.createMany).not.toHaveBeenCalled()
  })

  it("drops reminder fire times more than 60 seconds in the past", async () => {
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"))
    const tx = outboxTx()
    const { reconcileTimerReminders } = await import("./timer-reminders.server")

    await reconcileTimerReminders(tx as never, {
      project: { id: "project_123", ownerId: "user_123" },
      timer: makeTimer({
        id: "timer-a",
        targetDate: "2026-07-10T12:00:00.000Z",
        timezone: "UTC",
        reminders: [{ offsetMinutes: 2 }, { offsetMinutes: 0 }],
      }),
    })

    expect(tx.notificationOutboxItem.createMany).toHaveBeenCalledTimes(1)
    expect(tx.notificationOutboxItem.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({
        transactionId: "timer-reminder:project_123:timer-a:0m:2026-07-10T12:00:00.000Z",
        scheduledFor: new Date("2026-07-10T12:00:00.000Z"),
      }),
    )
  })

  it("keeps recurring reminder schedules timezone-aware across DST changes", async () => {
    const { reconcileTimerReminders } = await import("./timer-reminders.server")

    vi.setSystemTime(new Date("2026-03-28T10:00:00.000Z"))
    const springTx = outboxTx()
    await reconcileTimerReminders(springTx as never, {
      project: { id: "project_123", ownerId: "user_123" },
      timer: makeTimer({
        id: "timer-a",
        targetDate: "2026-03-28T09:00:00.000Z",
        timezone: "Europe/Warsaw",
        recurrence: { enabled: true, type: "daily" },
        reminders: [{ offsetMinutes: 30 }],
      }),
    })
    expect(springTx.notificationOutboxItem.createMany.mock.calls[0][0].data[0].scheduledFor).toEqual(
      new Date("2026-03-29T07:30:00.000Z"),
    )

    vi.setSystemTime(new Date("2026-10-24T10:00:00.000Z"))
    const autumnTx = outboxTx()
    await reconcileTimerReminders(autumnTx as never, {
      project: { id: "project_123", ownerId: "user_123" },
      timer: makeTimer({
        id: "timer-a",
        targetDate: "2026-10-24T08:00:00.000Z",
        timezone: "Europe/Warsaw",
        recurrence: { enabled: true, type: "daily" },
        reminders: [{ offsetMinutes: 30 }],
      }),
    })
    expect(autumnTx.notificationOutboxItem.createMany.mock.calls[0][0].data[0].scheduledFor).toEqual(
      new Date("2026-10-25T08:30:00.000Z"),
    )
  })

  it("supports monthly last-day recurrence", async () => {
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"))
    const tx = outboxTx()
    const { reconcileTimerReminders } = await import("./timer-reminders.server")

    await reconcileTimerReminders(tx as never, {
      project: { id: "project_123", ownerId: "user_123" },
      timer: makeTimer({
        id: "timer-a",
        targetDate: "2026-01-31T09:00:00.000Z",
        timezone: "Europe/Warsaw",
        recurrence: { enabled: true, type: "monthly", lastDay: true },
        reminders: [{ offsetMinutes: 60 }],
      }),
    })

    expect(tx.notificationOutboxItem.createMany.mock.calls[0][0].data[0].scheduledFor).toEqual(
      new Date("2026-02-28T08:00:00.000Z"),
    )
  })

  it("skips scheduled reminder intents outside the 30-minute delivery window", async () => {
    const prisma = deliveryPrisma({ items: [], lateSkipped: 2 })
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { deliverDueTimerReminders } = await import("./timer-reminders.server")

    await expect(deliverDueTimerReminders(25)).resolves.toEqual({
      delivered: 0,
      failed: 0,
      picked: 0,
      skipped: 2,
    })

    expect(prisma.notificationOutboxItem.updateMany).toHaveBeenCalledWith({
      where: {
        workflowIdentifier: "timer.reminder",
        status: "scheduled",
        scheduledFor: { lt: new Date("2026-07-10T11:19:00.000Z") },
      },
      data: { status: "skipped", processedAt: expect.any(Date), error: "late_window" },
    })
  })

  it("delivers due reminders and schedules the next recurring occurrence", async () => {
    vi.setSystemTime(new Date("2026-03-28T08:50:00.000Z"))
    const item = dueItem({
      transactionId: "timer-reminder:project_123:timer-a:10m:2026-03-28T09:00:00.000Z",
      payload: { projectId: "project_123", offsetMinutes: 10, occurrenceAt: "2026-03-28T09:00:00.000Z" },
    })
    const prisma = deliveryPrisma({
      items: [item],
      timer: timerRow({
        targetDate: "2026-03-28T09:00:00.000Z",
        timezone: "Europe/Warsaw",
        recurrence: { enabled: true, type: "daily" },
        reminders: [{ offsetMinutes: 10 }],
      }),
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { deliverDueTimerReminders } = await import("./timer-reminders.server")

    await expect(deliverDueTimerReminders(1)).resolves.toMatchObject({ delivered: 1, picked: 1 })

    expect(mocks.notificationDeliveryProvider.sendTimerReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ["in_app"],
        occurrenceAt: "2026-03-28T09:00:00.000Z",
        offsetMinutes: 10,
        inAppNotificationsEnabled: true,
      }),
    )
    expect(prisma.notificationOutboxItem.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          transactionId: "timer-reminder:project_123:timer-a:10m:2026-03-29T08:00:00.000Z",
          scheduledFor: new Date("2026-03-29T07:50:00.000Z"),
          status: "scheduled",
        }),
      ],
    })
  })

  it("skips in-app reminder delivery when the account preference is disabled", async () => {
    const prisma = deliveryPrisma({
      timer: {
        ...timerRow(),
        project: {
          ...timerRow().project,
          owner: {
            id: "user_123",
            email: "ada@example.com",
            preference: { emailReminders: false, inAppNotifications: false },
          },
        },
      },
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { deliverDueTimerReminders } = await import("./timer-reminders.server")

    await expect(deliverDueTimerReminders()).resolves.toMatchObject({ picked: 1, skipped: 1 })

    expect(mocks.notificationDeliveryProvider.sendTimerReminder).not.toHaveBeenCalled()
    expect(prisma.notificationOutboxItem.updateMany).toHaveBeenLastCalledWith({
      where: { id: "outbox_123" },
      data: {
        status: "skipped",
        error: undefined,
        processedAt: expect.any(Date),
        failedAt: undefined,
      },
    })
  })

  it.each([
    ["per-user", [0, 10]],
    ["global", [100]],
  ])("omits email and tracks a cap skip when the %s email cap is reached", async (_label, counts) => {
    vi.stubEnv("TICKWARD_REMINDER_EMAIL_DAILY_CAP", "100")
    vi.stubEnv("TICKWARD_REMINDER_EMAIL_DAILY_CAP_PER_USER", "10")
    const prisma = deliveryPrisma({
      deliveryLogCounts: counts,
      timer: {
        ...timerRow(),
        project: {
          ...timerRow().project,
          owner: {
            id: "user_123",
            email: "ada@example.com",
            preference: { emailReminders: true, inAppNotifications: true },
          },
        },
      },
    })
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { deliverDueTimerReminders } = await import("./timer-reminders.server")

    await expect(deliverDueTimerReminders()).resolves.toMatchObject({ delivered: 1, picked: 1 })

    expect(mocks.notificationDeliveryProvider.sendTimerReminder).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ["in_app"] }),
    )
    expect(mocks.notificationDeliveryTracker.trackDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        reason: "email_daily_cap",
        status: "skipped",
      }),
    )
  })

  it("does not deliver a legacy reminder whose timer id matches multiple projects", async () => {
    const item = dueItem({ payload: { offsetMinutes: 10, occurrenceAt: "2026-07-10T12:00:00.000Z" } })
    const prisma = deliveryPrisma({ items: [item], timerRows: [timerRow(), timerRow()] })
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { deliverDueTimerReminders } = await import("./timer-reminders.server")

    await expect(deliverDueTimerReminders()).resolves.toMatchObject({ delivered: 0, picked: 1 })

    expect(prisma.timer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "timer-a" }, take: 2 }))
    expect(mocks.notificationDeliveryProvider.sendTimerReminder).not.toHaveBeenCalled()
  })

  it("skips stale reminders when the offset is removed before delivery", async () => {
    const prisma = deliveryPrisma({ timer: timerRow({ reminders: [] }) })
    mocks.requirePrismaClient.mockReturnValue(prisma)
    const { deliverDueTimerReminders } = await import("./timer-reminders.server")

    await expect(deliverDueTimerReminders()).resolves.toMatchObject({ picked: 1, skipped: 1 })

    expect(mocks.notificationDeliveryProvider.sendTimerReminder).not.toHaveBeenCalled()
    expect(prisma.notificationOutboxItem.updateMany).toHaveBeenLastCalledWith({
      where: { id: "outbox_123" },
      data: {
        status: "skipped",
        error: "stale_reminder",
        processedAt: expect.any(Date),
        failedAt: undefined,
      },
    })
  })
})

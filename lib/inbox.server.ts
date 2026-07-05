import "server-only"

import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client"

const INBOX_PAGE_SIZE = 20

type InboxCursor = {
  createdAt: Date
  id: string
}

type InboxNotificationRow = {
  id: string
  type: string
  timerId: string | null
  projectId: string | null
  payload: Prisma.JsonValue
  readAt: Date | null
  createdAt: Date
}

export type InboxNotificationItem = {
  id: string
  type: string
  timer_id: string | null
  project_id: string | null
  payload: Prisma.JsonValue
  read_at: string | null
  created_at: string
}

export type InboxNotificationList = {
  object: "list"
  items: InboxNotificationItem[]
  unread_count: number
  next_cursor: string | null
}

function inboxPrisma(): PrismaClient {
  return requirePrismaClient()
}

function parseInboxCursor(value: string | null | undefined): InboxCursor | null {
  if (!value) return null
  const [createdAtRaw, id] = value.split("/", 2)
  if (!createdAtRaw || !id) return null
  const createdAt = new Date(createdAtRaw)
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id }
}

function inboxCursor(row: Pick<InboxNotificationRow, "createdAt" | "id">) {
  return `${row.createdAt.toISOString()}/${row.id}`
}

function inboxItem(row: InboxNotificationRow): InboxNotificationItem {
  return {
    id: row.id,
    type: row.type,
    timer_id: row.timerId,
    project_id: row.projectId,
    payload: row.payload,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }
}

export async function listInboxNotificationsForUser(args: {
  cursor?: string | null
  userId: string
}): Promise<InboxNotificationList> {
  const cursor = parseInboxCursor(args.cursor)
  const where: Prisma.InAppNotificationWhereInput = {
    userId: args.userId,
    ...(cursor
      ? {
          OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
        }
      : {}),
  }

  const prisma = inboxPrisma()
  const [rows, unreadCount] = await prisma.$transaction([
    prisma.inAppNotification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: INBOX_PAGE_SIZE + 1,
      select: {
        id: true,
        type: true,
        timerId: true,
        projectId: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.inAppNotification.count({ where: { userId: args.userId, readAt: null } }),
  ])

  const pageRows = rows.slice(0, INBOX_PAGE_SIZE)
  const nextRow = rows[INBOX_PAGE_SIZE]

  return {
    object: "list",
    items: pageRows.map(inboxItem),
    unread_count: unreadCount,
    next_cursor: nextRow ? inboxCursor(nextRow) : null,
  }
}

export async function unreadInboxNotificationCountForUser(userId: string) {
  return inboxPrisma().inAppNotification.count({ where: { userId, readAt: null } })
}

export async function markInboxNotificationsReadForUser(args: { all?: boolean; ids?: string[]; userId: string }) {
  const now = new Date()
  const ids = [...new Set(args.ids ?? [])]

  if (args.all) {
    await inboxPrisma().inAppNotification.updateMany({
      where: { userId: args.userId, readAt: null },
      data: { readAt: now },
    })
    return unreadInboxNotificationCountForUser(args.userId)
  }

  if (ids.length === 0) return unreadInboxNotificationCountForUser(args.userId)
  await inboxPrisma().inAppNotification.updateMany({
    where: { userId: args.userId, id: { in: ids }, readAt: null },
    data: { readAt: now },
  })
  return unreadInboxNotificationCountForUser(args.userId)
}

import "server-only"

import type { UserRef } from "@/lib/contracts"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client"

type TenantModels = Pick<PrismaClient, "project" | "space" | "timer">
type ScopedProjectDelegate = Pick<TenantModels["project"], "count" | "findFirst" | "findMany">
type ScopedSpaceDelegate = Pick<TenantModels["space"], "count" | "findFirst" | "findMany">
type ScopedTimerDelegate = Pick<TenantModels["timer"], "count" | "findFirst" | "findMany">

type TenantDb = {
  project: ScopedProjectDelegate
  space: ScopedSpaceDelegate
  timer: ScopedTimerDelegate
  unsafeGlobal(): TenantModels
}

function scopedArgs<TArgs extends { where?: unknown }>(
  args: TArgs | undefined,
  user: UserRef,
): TArgs & { where: Record<string, unknown> } {
  const where =
    args?.where && typeof args.where === "object" && !Array.isArray(args.where)
      ? (args.where as Record<string, unknown>)
      : {}

  return {
    ...(args ?? ({} as TArgs)),
    where: { ...where, ownerId: user.id },
  }
}

function projectDelegate(prisma: PrismaClient, user: UserRef): ScopedProjectDelegate {
  return {
    count: ((args?: Prisma.ProjectCountArgs) =>
      prisma.project.count(scopedArgs(args, user))) as ScopedProjectDelegate["count"],
    findFirst: ((args?: Prisma.ProjectFindFirstArgs) =>
      prisma.project.findFirst(scopedArgs(args, user))) as ScopedProjectDelegate["findFirst"],
    findMany: ((args?: Prisma.ProjectFindManyArgs) =>
      prisma.project.findMany(scopedArgs(args, user))) as ScopedProjectDelegate["findMany"],
  }
}

function spaceDelegate(prisma: PrismaClient, user: UserRef): ScopedSpaceDelegate {
  return {
    count: ((args?: Prisma.SpaceCountArgs) =>
      prisma.space.count(scopedArgs(args, user))) as ScopedSpaceDelegate["count"],
    findFirst: ((args?: Prisma.SpaceFindFirstArgs) =>
      prisma.space.findFirst(scopedArgs(args, user))) as ScopedSpaceDelegate["findFirst"],
    findMany: ((args?: Prisma.SpaceFindManyArgs) =>
      prisma.space.findMany(scopedArgs(args, user))) as ScopedSpaceDelegate["findMany"],
  }
}

function timerDelegate(prisma: PrismaClient, user: UserRef): ScopedTimerDelegate {
  return {
    count: ((args?: Prisma.TimerCountArgs) =>
      prisma.timer.count(scopedArgs(args, user))) as ScopedTimerDelegate["count"],
    findFirst: ((args?: Prisma.TimerFindFirstArgs) =>
      prisma.timer.findFirst(scopedArgs(args, user))) as ScopedTimerDelegate["findFirst"],
    findMany: ((args?: Prisma.TimerFindManyArgs) =>
      prisma.timer.findMany(scopedArgs(args, user))) as ScopedTimerDelegate["findMany"],
  }
}

export function tenantDb(user: UserRef): TenantDb {
  const prisma = requirePrismaClient()

  return {
    project: projectDelegate(prisma, user),
    space: spaceDelegate(prisma, user),
    timer: timerDelegate(prisma, user),
    unsafeGlobal: () => ({
      project: prisma.project,
      space: prisma.space,
      timer: prisma.timer,
    }),
  }
}

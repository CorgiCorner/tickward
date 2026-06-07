import { UNASSIGNED_SPACE_ID } from "@/lib/types"

type TimerSpaceItem = {
  archivedAt?: string
  spaceId?: string
}

export function timerTargetSpaceId(spaceId: string | null | undefined) {
  return spaceId && spaceId !== UNASSIGNED_SPACE_ID ? spaceId : undefined
}

export function activeTimerCountForTargetSpace(timers: TimerSpaceItem[], spaceId: string | null | undefined) {
  const targetSpaceId = timerTargetSpaceId(spaceId)
  let count = 0

  for (const timer of timers) {
    if (timer.archivedAt) continue
    if (targetSpaceId ? timer.spaceId === targetSpaceId : !timer.spaceId) count += 1
  }

  return count
}

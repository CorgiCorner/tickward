export const PROJECT_CLAIM_DISMISSED_CHANGED = "tickward:project-claim-dismissed-changed"

type ProjectClaimDismissalStorage = Pick<Storage, "getItem" | "setItem">

function browserStorage(): ProjectClaimDismissalStorage | null {
  if (globalThis.window === undefined) return null
  return globalThis.sessionStorage
}

export function projectClaimDismissedKey(projectId: string) {
  return `tickward:project-claim-dismissed:${projectId}`
}

export function isProjectClaimDismissed(projectId: string | null | undefined, storage = browserStorage()) {
  if (!projectId) return false
  return storage?.getItem(projectClaimDismissedKey(projectId)) === "1"
}

export function dismissProjectClaim(projectId: string, storage = browserStorage()) {
  storage?.setItem(projectClaimDismissedKey(projectId), "1")
  if (globalThis.window !== undefined) {
    globalThis.window.dispatchEvent(new Event(PROJECT_CLAIM_DISMISSED_CHANGED))
  }
}

export function subscribeProjectClaimDismissed(projectId: string | null | undefined, callback: () => void) {
  if (globalThis.window === undefined || !projectId) return () => {}

  const key = projectClaimDismissedKey(projectId)
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) callback()
  }
  const onLocalChange = () => callback()

  globalThis.window.addEventListener("storage", onStorage)
  globalThis.window.addEventListener(PROJECT_CLAIM_DISMISSED_CHANGED, onLocalChange)

  return () => {
    globalThis.window.removeEventListener("storage", onStorage)
    globalThis.window.removeEventListener(PROJECT_CLAIM_DISMISSED_CHANGED, onLocalChange)
  }
}

import { DEFAULT_LOCALE, isSupportedLocale, localeHref } from "@/lib/i18n/messages"

export const COUNT_UP_VIEW_EVENT = "tickward:count-up-view"

export const COUNT_UP_HIGHLIGHT_DURATION_MS = 1_800
const COUNT_UP_REVEAL_RETRY_MS = 50
const COUNT_UP_REVEAL_RETRY_LIMIT = 40
const PENDING_COUNT_UP_TARGET_KEY = "tickward:count-up:target"

export type CountUpNavigationTarget = Readonly<{
  projectId: string
  timerId: string
  targetAtMs?: number
}>

export function countUpHomeHref(pathname: string) {
  const localeSegment = pathname.split("/").filter(Boolean)[0] ?? DEFAULT_LOCALE
  const locale = isSupportedLocale(localeSegment) ? localeSegment : DEFAULT_LOCALE
  return localeHref(locale, "/")
}

export function countUpSettingsHref(pathname: string | null) {
  const localeSegment = pathname?.split("/").filter(Boolean)[0] ?? DEFAULT_LOCALE
  const locale = isSupportedLocale(localeSegment) ? localeSegment : DEFAULT_LOCALE
  return `${localeHref(locale, "/settings")}#count-up`
}

function isCountUpNavigationTarget(value: unknown): value is CountUpNavigationTarget {
  if (!value || typeof value !== "object") return false
  const projectId = Reflect.get(value, "projectId")
  const timerId = Reflect.get(value, "timerId")
  const targetAtMs = Reflect.get(value, "targetAtMs")
  return (
    typeof projectId === "string" &&
    projectId.length > 0 &&
    typeof timerId === "string" &&
    timerId.length > 0 &&
    (targetAtMs === undefined ||
      (typeof targetAtMs === "number" && Number.isSafeInteger(targetAtMs) && targetAtMs >= 0))
  )
}

export function storePendingCountUpTarget(target: CountUpNavigationTarget) {
  if (globalThis.sessionStorage === undefined) return
  globalThis.sessionStorage.setItem(PENDING_COUNT_UP_TARGET_KEY, JSON.stringify(target))
}

export function takePendingCountUpTarget(): CountUpNavigationTarget | null {
  if (globalThis.sessionStorage === undefined) return null
  const raw = globalThis.sessionStorage.getItem(PENDING_COUNT_UP_TARGET_KEY)
  globalThis.sessionStorage.removeItem(PENDING_COUNT_UP_TARGET_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isCountUpNavigationTarget(parsed) ? parsed : null
  } catch {
    return null
  }
}

type CountUpNavigationOptions = Readonly<{
  openProject: (projectId: string) => void | Promise<void>
  prepareTarget?: () => void | Promise<void>
  root?: Document
  retryMs?: number
  retryLimit?: number
}>

const highlightTimeouts = new WeakMap<HTMLElement, ReturnType<typeof globalThis.setTimeout>>()

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

export function findCountUpCard(target: CountUpNavigationTarget, root: Document = document): HTMLElement | null {
  for (const candidate of root.querySelectorAll<HTMLElement>("[data-count-up-timer-id]")) {
    if (candidate.dataset.countUpProjectId !== target.projectId) continue
    if (candidate.dataset.countUpTimerId !== target.timerId) continue
    if (target.targetAtMs !== undefined && candidate.dataset.countUpTargetAtMs !== String(target.targetAtMs)) {
      continue
    }
    return candidate
  }
  return null
}

export function isCountUpCardInViewport(element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect()
  const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth
  const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight
  return bounds.bottom > 0 && bounds.right > 0 && bounds.top < viewportHeight && bounds.left < viewportWidth
}

function waitForCountUpCard(
  target: CountUpNavigationTarget,
  root: Document,
  retryMs: number,
  retryLimit: number,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    let attempts = 0
    const find = () => {
      const card = findCountUpCard(target, root)
      if (card || attempts >= retryLimit) {
        resolve(card)
        return
      }
      attempts += 1
      globalThis.setTimeout(find, retryMs)
    }
    find()
  })
}

export async function navigateToCountUpCard(
  target: CountUpNavigationTarget,
  options: CountUpNavigationOptions,
): Promise<boolean> {
  await options.openProject(target.projectId)
  await options.prepareTarget?.()
  const root = options.root ?? document
  const card = await waitForCountUpCard(
    target,
    root,
    options.retryMs ?? COUNT_UP_REVEAL_RETRY_MS,
    options.retryLimit ?? COUNT_UP_REVEAL_RETRY_LIMIT,
  )
  if (!card) return false

  card.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
  })
  card.dataset.countUpHighlighted = "true"

  const previousTimeout = highlightTimeouts.get(card)
  if (previousTimeout !== undefined) globalThis.clearTimeout(previousTimeout)
  const timeout = globalThis.setTimeout(() => {
    delete card.dataset.countUpHighlighted
    highlightTimeouts.delete(card)
  }, COUNT_UP_HIGHLIGHT_DURATION_MS)
  highlightTimeouts.set(card, timeout)
  return true
}

"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"

import { COUNT_UP_POLICY_MODES, type CountUpPolicyMode } from "@/lib/count-up-policy"

type PlausibleAnalyticsProps = Readonly<{
  domain: string
  scriptUrl: string
}>

export const COUNT_UP_ANALYTICS_EVENTS = [
  "timer_crossed_zero",
  "transition_first_seen",
  "transition_acknowledged",
  "transition_pinned",
  "transition_extended",
  "transition_auto_expired",
  "transition_jump_clicked",
  "transition_bulk_action",
  "transition_undo",
  "transition_policy_changed",
] as const

export type CountUpAnalyticsEvent = (typeof COUNT_UP_ANALYTICS_EVENTS)[number]
export type CountUpAnalyticsPolicy = CountUpPolicyMode | "mixed"
export type CrossedToFirstSeenBucket =
  | "under_5s"
  | "5_to_29s"
  | "30_to_119s"
  | "2_to_4m"
  | "5_to_14m"
  | "15_to_59m"
  | "1_to_23h"
  | "1d_plus"
export type CountUpSectionSizeBucket = "0" | "1" | "2_to_3" | "4_to_10" | "11_plus"

export type CountUpAnalyticsInput = Readonly<{
  policy?: CountUpAnalyticsPolicy
  secondsFromCrossedAtToFirstSeen?: number
  sectionSize?: number
}>

export type CountUpAnalyticsProperties = Readonly<{
  policy?: CountUpAnalyticsPolicy
  seconds_from_crossed_to_first_seen?: CrossedToFirstSeenBucket
  section_size?: CountUpSectionSizeBucket
}>

type PlausibleCommand = ((event: string, options: { props: CountUpAnalyticsProperties }) => void) & {
  q?: Array<[string, { props: CountUpAnalyticsProperties }]>
}

const countUpOccurrenceNames = new Set<string>(COUNT_UP_ANALYTICS_EVENTS)
const countUpPolicyModes = new Set<string>([...COUNT_UP_POLICY_MODES, "mixed"])

export function bucketCrossedToFirstSeenSeconds(seconds: number): CrossedToFirstSeenBucket | undefined {
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  if (seconds < 5) return "under_5s"
  if (seconds < 30) return "5_to_29s"
  if (seconds < 120) return "30_to_119s"
  if (seconds < 300) return "2_to_4m"
  if (seconds < 900) return "5_to_14m"
  if (seconds < 3_600) return "15_to_59m"
  if (seconds < 86_400) return "1_to_23h"
  return "1d_plus"
}

export function bucketCountUpSectionSize(size: number): CountUpSectionSizeBucket | undefined {
  if (!Number.isSafeInteger(size) || size < 0) return undefined
  if (size === 0) return "0"
  if (size === 1) return "1"
  if (size <= 3) return "2_to_3"
  if (size <= 10) return "4_to_10"
  return "11_plus"
}

export function aggregateCountUpAnalyticsPolicy(
  policies: ReadonlyArray<CountUpPolicyMode | undefined>,
): CountUpAnalyticsPolicy | undefined {
  const knownPolicies = new Set(policies.filter((policy): policy is CountUpPolicyMode => policy !== undefined))
  if (knownPolicies.size === 0) return undefined
  if (knownPolicies.size === 1) return [...knownPolicies][0]
  return "mixed"
}

export function sanitizeCountUpAnalyticsProperties(value: unknown): CountUpAnalyticsProperties {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const properties: {
    policy?: CountUpAnalyticsPolicy
    seconds_from_crossed_to_first_seen?: CrossedToFirstSeenBucket
    section_size?: CountUpSectionSizeBucket
  } = {}

  if (typeof input.policy === "string" && countUpPolicyModes.has(input.policy)) {
    properties.policy = input.policy as CountUpAnalyticsPolicy
  }
  if (typeof input.secondsFromCrossedAtToFirstSeen === "number") {
    properties.seconds_from_crossed_to_first_seen = bucketCrossedToFirstSeenSeconds(
      input.secondsFromCrossedAtToFirstSeen,
    )
  }
  if (typeof input.sectionSize === "number") {
    properties.section_size = bucketCountUpSectionSize(input.sectionSize)
  }

  return properties
}

function plausibleCommand(): PlausibleCommand | null {
  if (globalThis.window === undefined) return null
  const target = globalThis.window as typeof globalThis.window & { plausible?: PlausibleCommand }
  if (typeof target.plausible === "function") return target.plausible

  const queued: PlausibleCommand = (event, options) => {
    ;(queued.q ??= []).push([event, options])
  }
  target.plausible = queued
  return queued
}

export function trackCountUpAnalyticsEvent(
  event: CountUpAnalyticsEvent,
  properties: CountUpAnalyticsInput = {},
): boolean {
  if (!countUpOccurrenceNames.has(event)) return false
  const plausible = plausibleCommand()
  if (!plausible) return false
  plausible(event, { props: sanitizeCountUpAnalyticsProperties(properties) })
  return true
}

export function isEmbedPath(pathname: string) {
  return /^\/(?:[a-z]{2}\/)?embed(?:\/|$)/.test(pathname)
}

export function PlausibleAnalytics(props: PlausibleAnalyticsProps) {
  const pathname = usePathname()

  // An embed is rendered from tickward.com inside somebody else's page. Its
  // pageview would therefore inflate Tickward traffic and attribute the host
  // page as a referrer. Embed adoption is tracked separately by EmbedBeacon.
  if (isEmbedPath(pathname)) return null

  return <Script defer data-domain={props.domain} src={props.scriptUrl} strategy="afterInteractive" />
}

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  pathname: "/",
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}))

vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => <script data-testid="analytics-script" {...props} />,
}))

import {
  aggregateCountUpAnalyticsPolicy,
  bucketCountUpSectionSize,
  bucketCrossedToFirstSeenSeconds,
  isEmbedPath,
  PlausibleAnalytics,
  sanitizeCountUpAnalyticsProperties,
  trackCountUpAnalyticsEvent,
} from "./plausible-analytics"

describe("PlausibleAnalytics", () => {
  beforeEach(() => {
    mocks.pathname = "/"
    Reflect.deleteProperty(window, "plausible")
  })

  it("uses stable bounded buckets for elapsed time and section size", () => {
    expect(
      [0, 4, 5, 29, 30, 119, 120, 299, 300, 899, 900, 3_599, 3_600, 86_399, 86_400].map(
        bucketCrossedToFirstSeenSeconds,
      ),
    ).toEqual([
      "under_5s",
      "under_5s",
      "5_to_29s",
      "5_to_29s",
      "30_to_119s",
      "30_to_119s",
      "2_to_4m",
      "2_to_4m",
      "5_to_14m",
      "5_to_14m",
      "15_to_59m",
      "15_to_59m",
      "1_to_23h",
      "1_to_23h",
      "1d_plus",
    ])
    expect([0, 1, 2, 3, 4, 10, 11, 1_000_000].map(bucketCountUpSectionSize)).toEqual([
      "0",
      "1",
      "2_to_3",
      "2_to_3",
      "4_to_10",
      "4_to_10",
      "11_plus",
      "11_plus",
    ])
    expect(bucketCrossedToFirstSeenSeconds(-1)).toBeUndefined()
    expect(bucketCountUpSectionSize(1.5)).toBeUndefined()
    expect(aggregateCountUpAnalyticsPolicy([])).toBeUndefined()
    expect(aggregateCountUpAnalyticsPolicy(["after-seen-5m", "after-seen-5m"])).toBe("after-seen-5m")
    expect(aggregateCountUpAnalyticsPolicy(["after-seen-5m", "until-i-move-it"])).toBe("mixed")
  })

  it("sanitizes analytics properties to bounded non-PII values", () => {
    expect(
      sanitizeCountUpAnalyticsProperties({
        policy: "after-seen-15m",
        secondsFromCrossedAtToFirstSeen: 72,
        sectionSize: 14,
        label: "Private launch",
        timerId: "timer-secret",
        userId: "user-secret",
        crossedAt: 1_720_000_000_000,
      }),
    ).toEqual({
      policy: "after-seen-15m",
      seconds_from_crossed_to_first_seen: "30_to_119s",
      section_size: "11_plus",
    })
    expect(
      sanitizeCountUpAnalyticsProperties({ policy: "invalid", secondsFromCrossedAtToFirstSeen: Infinity }),
    ).toEqual({})
  })

  it("queues only declared attention events and never forwards labels or identifiers", () => {
    expect(
      trackCountUpAnalyticsEvent("transition_first_seen", {
        policy: "until-i-move-it",
        secondsFromCrossedAtToFirstSeen: 8,
        sectionSize: 2,
        label: "Secret label",
      } as never),
    ).toBe(true)
    expect(trackCountUpAnalyticsEvent("not_a_contract_event" as never, {})).toBe(false)

    const plausible = (window as typeof window & { plausible?: { q?: unknown[] } }).plausible
    expect(plausible?.q).toEqual([
      [
        "transition_first_seen",
        {
          props: {
            policy: "until-i-move-it",
            seconds_from_crossed_to_first_seen: "5_to_29s",
            section_size: "2_to_3",
          },
        },
      ],
    ])
    expect(JSON.stringify(plausible?.q)).not.toContain("Secret label")
    expect(JSON.stringify(plausible?.q)).not.toContain("timer")
  })

  it.each([
    "/embed/share_123",
    "/embed",
    "/en/embed/share_123",
    "/pl/embed/share_123",
  ])("does not load on embed path %s", (pathname) => {
    mocks.pathname = pathname

    render(<PlausibleAnalytics domain="tickward.test" scriptUrl="https://stats.test/js/script.js" />)

    expect(screen.queryByTestId("analytics-script")).not.toBeInTheDocument()
    expect(isEmbedPath(pathname)).toBe(true)
  })

  it("loads on regular application pages", () => {
    mocks.pathname = "/en/timers"

    render(<PlausibleAnalytics domain="tickward.test" scriptUrl="https://stats.test/js/script.js" />)

    expect(screen.getByTestId("analytics-script")).toHaveAttribute("data-domain", "tickward.test")
    expect(screen.getByTestId("analytics-script")).toHaveAttribute("src", "https://stats.test/js/script.js")
  })
})

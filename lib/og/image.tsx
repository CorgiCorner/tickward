import type { ReactNode } from "react"

import type { OgCountdownSnapshot } from "@/lib/og/data"

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const

const colors = {
  fg: "#18181b",
  muted: "#71717a",
  faint: "#a1a1aa",
  border: "#e4e4e7",
  track: "#f4f4f5",
  bg: "#ffffff",
  icon: "#3f3f46",
  colon: "#d4d4d8",
} as const

const defaultCountdown: OgCountdownSnapshot = {
  isCountUp: false,
  days: "10",
  hours: "04",
  minutes: "12",
  seconds: "33",
}

type IconName = "timer" | "calendar" | "clock" | "bell" | "repeat" | "hourglass"

function OgIcon(props: Readonly<{ name: IconName; size?: number; color?: string }>) {
  const size = props.size ?? 34
  const color = props.color ?? colors.icon
  const iconProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const

  if (props.name === "timer") {
    return (
      <svg {...iconProps}>
        <line x1="10" x2="14" y1="2" y2="2" />
        <line x1="12" x2="15" y1="14" y2="11" />
        <circle cx="12" cy="14" r="8" />
      </svg>
    )
  }

  if (props.name === "calendar") {
    return (
      <svg {...iconProps}>
        <path d="M8 2v4M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </svg>
    )
  }

  if (props.name === "clock") {
    return (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    )
  }

  if (props.name === "bell") {
    return (
      <svg {...iconProps}>
        <path d="M10.268 21a2 2 0 0 0 3.464 0" />
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
      </svg>
    )
  }

  if (props.name === "repeat") {
    return (
      <svg {...iconProps}>
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      </svg>
    )
  }

  return (
    <svg {...iconProps}>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  )
}

function PatternRows() {
  const rows: ReadonlyArray<{ opacity: number; marginLeft?: number; icons: IconName[] }> = [
    { opacity: 0.1, icons: ["timer", "calendar", "clock", "bell", "repeat", "hourglass", "clock"] },
    {
      opacity: 0.06,
      marginLeft: -48,
      icons: ["clock", "repeat", "timer", "bell", "calendar", "clock", "hourglass"],
    },
    { opacity: 0.03, marginLeft: 24, icons: ["calendar", "timer", "clock", "repeat", "bell", "hourglass"] },
  ]

  return (
    <div
      style={{
        position: "absolute",
        top: -14,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        gap: 34,
      }}
    >
      {rows.map((row, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 64,
            opacity: row.opacity,
            marginLeft: row.marginLeft ?? 0,
          }}
        >
          {row.icons.map((icon, iconIndex) => (
            <OgIcon key={`${icon}-${iconIndex}`} name={icon} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Logo(props: Readonly<{ size: number; fontSize: number; gap: number }>) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: props.gap }}>
      <OgIcon name="timer" size={props.size} color={colors.fg} />
      <div
        style={{
          display: "flex",
          fontSize: props.fontSize,
          fontWeight: 600,
          letterSpacing: 0,
          color: colors.fg,
        }}
      >
        tickward
      </div>
    </div>
  )
}

function Frame(props: Readonly<{ children: ReactNode; centered?: boolean }>) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: props.centered ? "center" : "stretch",
        justifyContent: props.centered ? "center" : "flex-start",
        position: "relative",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        overflow: "hidden",
        fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <PatternRows />
      {props.children}
    </div>
  )
}

function CompactCountdown(props: Readonly<{ countdown?: OgCountdownSnapshot }>) {
  const countdown = props.countdown ?? defaultCountdown
  const units = [
    { value: countdown.days, suffix: "d", color: colors.fg },
    { value: countdown.hours, suffix: "h", color: colors.fg },
    { value: countdown.minutes, suffix: "m", color: colors.fg },
    { value: countdown.seconds, suffix: "s", color: colors.faint },
  ] as const

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        marginTop: 40,
        fontFamily: "Geist Mono, monospace",
      }}
    >
      {units.map((unit) => (
        <div
          key={unit.suffix}
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: 0,
            color: unit.color,
          }}
        >
          {unit.value}
          <div style={{ display: "flex", color: colors.faint }}>{unit.suffix}</div>
        </div>
      ))}
    </div>
  )
}

function trimText(value: string, max: number) {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  const truncated = trimmed.slice(0, max - 3).trimEnd()
  const lastSpace = truncated.lastIndexOf(" ")
  const wordSafe = lastSpace > max * 0.6 ? truncated.slice(0, lastSpace) : truncated
  return `${wordSafe}...`
}

export function DefaultOgImage() {
  return (
    <Frame centered>
      <Logo size={44} fontSize={44} gap={14} />
      <div style={{ display: "flex", marginTop: 24, fontSize: 30, color: colors.muted, textAlign: "center" }}>
        Countdown timer to any date
      </div>
      <CompactCountdown />
    </Frame>
  )
}

export function TitleOgImage(props: Readonly<{ title: string; subtitle?: string }>) {
  return (
    <Frame centered>
      <Logo size={40} fontSize={40} gap={12} />
      <div
        style={{
          display: "flex",
          marginTop: 30,
          maxWidth: 940,
          textAlign: "center",
          fontSize: 48,
          fontWeight: 600,
          lineHeight: 1.12,
          letterSpacing: 0,
          color: colors.fg,
        }}
      >
        {trimText(props.title, 82)}
      </div>
      {props.subtitle ? (
        <div
          style={{
            display: "flex",
            marginTop: 18,
            maxWidth: 840,
            textAlign: "center",
            fontSize: 24,
            lineHeight: 1.35,
            color: colors.muted,
          }}
        >
          {trimText(props.subtitle, 132)}
        </div>
      ) : null}
      <CompactCountdown />
    </Frame>
  )
}

function CountdownUnit(props: Readonly<{ value: string; label: string; muted?: boolean }>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          fontSize: 84,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: 0,
          color: props.muted ? colors.faint : colors.fg,
        }}
      >
        {props.value}
      </div>
      <div style={{ display: "flex", marginTop: 10, fontSize: 16, letterSpacing: 2, color: colors.faint }}>
        {props.label}
      </div>
    </div>
  )
}

function CountdownSeparator() {
  return <div style={{ display: "flex", height: 84, alignItems: "center", fontSize: 44, color: colors.colon }}>:</div>
}

export function TimerOgImage(
  props: Readonly<{
    title: string
    dateLabel: string
    countdown: OgCountdownSnapshot
    spaceName: string
    spaceColor: string
    progressFraction?: number | null
  }>,
) {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "52px 72px",
          position: "relative",
        }}
      >
        <Logo size={26} fontSize={26} gap={10} />
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              width: 10,
              height: 10,
              borderRadius: 9999,
              background: props.spaceColor,
            }}
          />
          <div style={{ display: "flex", fontSize: 22, fontWeight: 500, color: colors.muted }}>
            {trimText(props.spaceName, 36)}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 12,
            maxWidth: 980,
            fontSize: 56,
            fontWeight: 600,
            lineHeight: 1.08,
            letterSpacing: 0,
            color: colors.fg,
          }}
        >
          {trimText(props.title, 58)}
        </div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 22, color: colors.muted }}>
          {props.countdown.isCountUp ? `Since ${props.dateLabel}` : props.dateLabel}
        </div>
        {props.countdown.isCountUp ? (
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 2,
              color: colors.faint,
            }}
          >
            SINCE
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 18,
            marginTop: props.countdown.isCountUp ? 10 : 32,
            fontFamily: "Geist Mono, monospace",
          }}
        >
          <CountdownUnit value={props.countdown.days} label="DAYS" muted={props.countdown.isCountUp} />
          <CountdownSeparator />
          <CountdownUnit value={props.countdown.hours} label="HRS" muted={props.countdown.isCountUp} />
          <CountdownSeparator />
          <CountdownUnit value={props.countdown.minutes} label="MIN" muted={props.countdown.isCountUp} />
          <CountdownSeparator />
          <CountdownUnit value={props.countdown.seconds} label="SEC" muted />
        </div>
      </div>
      {props.progressFraction === null || props.progressFraction === undefined ? null : (
        <div style={{ display: "flex", height: 8, background: colors.track }}>
          <div
            style={{ display: "flex", width: `${Math.round(props.progressFraction * 100)}%`, background: colors.faint }}
          />
        </div>
      )}
    </Frame>
  )
}

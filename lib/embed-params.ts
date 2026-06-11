// Embed query parameter parsing. Server-validated with safe fallbacks:
// invalid values never error, they fall back to defaults so a hand-edited
// snippet keeps rendering inside someone's site.

export const EMBED_LAYOUTS = ["text", "minimal", "compact", "square", "horizontal"] as const
export type EmbedLayout = (typeof EMBED_LAYOUTS)[number]

export const EMBED_THEMES = ["auto", "light", "dark"] as const
export type EmbedTheme = (typeof EMBED_THEMES)[number]

export const EMBED_FONTS = ["system", "mono"] as const
export type EmbedFont = (typeof EMBED_FONTS)[number]

export const EMBED_SCALE_MIN = 0.5
export const EMBED_SCALE_MAX = 2

export type EmbedParams = {
  layout: EmbedLayout
  theme: EmbedTheme
  /** "transparent", a normalized "#rrggbb" color, or null for the theme default. */
  bg: string | null
  /** Normalized "#rrggbb" color for digits, or null for the theme default. */
  accent: string | null
  font: EmbedFont
  /** Size factor, clamped to [EMBED_SCALE_MIN, EMBED_SCALE_MAX]. */
  scale: number
  /** Show unit captions under digits. */
  labels: boolean
  /** Show the absolute target date line. */
  showTarget: boolean
}

export const DEFAULT_EMBED_PARAMS: EmbedParams = {
  layout: "compact",
  theme: "light",
  bg: null,
  accent: null,
  font: "system",
  scale: 1,
  labels: true,
  showTarget: true,
}

const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Accepts 3- or 6-digit hex with or without "#"; returns normalized "#rrggbb" or null. */
export function parseHexColor(value: string | undefined): string | null {
  const match = value ? HEX_COLOR_PATTERN.exec(value) : null
  if (!match?.[1]) return null
  const hex = match[1].toLowerCase()
  const expanded = hex.length === 3 ? hex.replace(/./g, (char) => char + char) : hex
  return `#${expanded}`
}

function toggle(value: string | undefined, fallback: boolean): boolean {
  if (value === "on") return true
  if (value === "off") return false
  return fallback
}

function parseScale(value: string | undefined): number {
  const parsed = value === undefined || value.trim() === "" ? Number.NaN : Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_EMBED_PARAMS.scale
  return Math.min(EMBED_SCALE_MAX, Math.max(EMBED_SCALE_MIN, parsed))
}

function parseBg(value: string | undefined): string | null {
  if (value === "transparent") return "transparent"
  return parseHexColor(value)
}

export function parseEmbedParams(searchParams: SearchParams): EmbedParams {
  return {
    layout: oneOf(first(searchParams.layout), EMBED_LAYOUTS, DEFAULT_EMBED_PARAMS.layout),
    theme: oneOf(first(searchParams.theme), EMBED_THEMES, DEFAULT_EMBED_PARAMS.theme),
    bg: parseBg(first(searchParams.bg)),
    accent: parseHexColor(first(searchParams.accent)),
    font: oneOf(first(searchParams.font), EMBED_FONTS, DEFAULT_EMBED_PARAMS.font),
    scale: parseScale(first(searchParams.scale)),
    labels: toggle(first(searchParams.labels), DEFAULT_EMBED_PARAMS.labels),
    showTarget: toggle(first(searchParams.target), DEFAULT_EMBED_PARAMS.showTarget),
  }
}

/** Build the query string for a snippet, omitting params at their defaults. */
export function embedQueryString(params: Partial<EmbedParams>): string {
  const query = new URLSearchParams()
  if (params.layout && params.layout !== DEFAULT_EMBED_PARAMS.layout) query.set("layout", params.layout)
  if (params.theme && params.theme !== DEFAULT_EMBED_PARAMS.theme) query.set("theme", params.theme)
  if (params.bg) query.set("bg", params.bg === "transparent" ? "transparent" : params.bg.replace(/^#/, ""))
  if (params.accent) query.set("accent", params.accent.replace(/^#/, ""))
  if (params.font && params.font !== DEFAULT_EMBED_PARAMS.font) query.set("font", params.font)
  if (params.scale !== undefined && params.scale !== DEFAULT_EMBED_PARAMS.scale)
    query.set("scale", String(params.scale))
  if (params.labels === false) query.set("labels", "off")
  if (params.showTarget === false) query.set("target", "off")
  const value = query.toString()
  return value ? `?${value}` : ""
}

/** Recommended iframe size per layout, documented for snippet generation. */
export const EMBED_RECOMMENDED_SIZE: Record<EmbedLayout, { width: number; height: number; minWidth: number }> = {
  text: { width: 320, height: 48, minWidth: 220 },
  minimal: { width: 360, height: 64, minWidth: 260 },
  compact: { width: 288, height: 140, minWidth: 200 },
  square: { width: 280, height: 280, minWidth: 180 },
  horizontal: { width: 560, height: 96, minWidth: 360 },
}

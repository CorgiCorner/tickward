import { describe, expect, it } from "vitest"

import {
  DEFAULT_EMBED_PARAMS,
  EMBED_DONE_TEXT_MAX_LENGTH,
  EMBED_END_MODES,
  EMBED_FONTS,
  EMBED_LAYOUTS,
  EMBED_SCALE_MAX,
  EMBED_SCALE_MIN,
  EMBED_THEMES,
  embedQueryString,
  parseEmbedParams,
  parseHexColor,
} from "./embed-params"

describe("parseEmbedParams", () => {
  it("returns defaults for empty search params", () => {
    expect(parseEmbedParams({})).toEqual(DEFAULT_EMBED_PARAMS)
  })

  it("accepts every valid layout", () => {
    for (const layout of EMBED_LAYOUTS) {
      expect(parseEmbedParams({ layout }).layout).toBe(layout)
    }
  })

  it("falls back to the default layout for invalid values", () => {
    expect(parseEmbedParams({ layout: "banner" }).layout).toBe(DEFAULT_EMBED_PARAMS.layout)
  })

  it("defaults the theme to light", () => {
    expect(DEFAULT_EMBED_PARAMS.theme).toBe("light")
    expect(parseEmbedParams({}).theme).toBe("light")
  })

  it("accepts every valid theme and falls back for invalid values", () => {
    for (const theme of EMBED_THEMES) {
      expect(parseEmbedParams({ theme }).theme).toBe(theme)
    }
    expect(parseEmbedParams({ theme: "auto" }).theme).toBe("auto")
    expect(parseEmbedParams({ theme: "midnight" }).theme).toBe(DEFAULT_EMBED_PARAMS.theme)
  })

  it("accepts every valid font and falls back for invalid values", () => {
    for (const font of EMBED_FONTS) {
      expect(parseEmbedParams({ font }).font).toBe(font)
    }
    expect(parseEmbedParams({ font: "serif" }).font).toBe(DEFAULT_EMBED_PARAMS.font)
  })

  it("normalizes accent colors with or without a leading #", () => {
    expect(parseEmbedParams({ accent: "e85d2a" }).accent).toBe("#e85d2a")
    expect(parseEmbedParams({ accent: "#E85D2A" }).accent).toBe("#e85d2a")
  })

  it("expands 3-digit accent colors", () => {
    expect(parseEmbedParams({ accent: "f0a" }).accent).toBe("#ff00aa")
    expect(parseEmbedParams({ accent: "#FFF" }).accent).toBe("#ffffff")
  })

  it("returns null for invalid accent colors", () => {
    expect(parseEmbedParams({ accent: "zzz" }).accent).toBeNull()
    expect(parseEmbedParams({ accent: "abcd" }).accent).toBeNull()
    expect(parseEmbedParams({ accent: "not-a-color" }).accent).toBeNull()
  })

  it("supports bg=transparent and hex backgrounds", () => {
    expect(parseEmbedParams({ bg: "transparent" }).bg).toBe("transparent")
    expect(parseEmbedParams({ bg: "112233" }).bg).toBe("#112233")
    expect(parseEmbedParams({ bg: "123" }).bg).toBe("#112233")
    expect(parseEmbedParams({ bg: "nope" }).bg).toBeNull()
  })

  it("clamps scale to the allowed range", () => {
    expect(EMBED_SCALE_MIN).toBe(0.5)
    expect(EMBED_SCALE_MAX).toBe(2)
    expect(parseEmbedParams({ scale: "0.1" }).scale).toBe(0.5)
    expect(parseEmbedParams({ scale: "9" }).scale).toBe(2)
    expect(parseEmbedParams({ scale: "0.5" }).scale).toBe(0.5)
    expect(parseEmbedParams({ scale: "2" }).scale).toBe(2)
    expect(parseEmbedParams({ scale: "1.25" }).scale).toBe(1.25)
  })

  it("falls back to the default scale for non-numeric values", () => {
    expect(parseEmbedParams({ scale: "huge" }).scale).toBe(DEFAULT_EMBED_PARAMS.scale)
    expect(parseEmbedParams({ scale: "" }).scale).toBe(DEFAULT_EMBED_PARAMS.scale)
    expect(parseEmbedParams({ scale: "1px" }).scale).toBe(DEFAULT_EMBED_PARAMS.scale)
  })

  it("parses labels and target toggles", () => {
    expect(parseEmbedParams({ labels: "off" }).labels).toBe(false)
    expect(parseEmbedParams({ labels: "on" }).labels).toBe(true)
    expect(parseEmbedParams({ labels: "maybe" }).labels).toBe(DEFAULT_EMBED_PARAMS.labels)
    expect(parseEmbedParams({ target: "off" }).showTarget).toBe(false)
    expect(parseEmbedParams({ target: "on" }).showTarget).toBe(true)
  })

  it("accepts every valid end mode and falls back for invalid values", () => {
    for (const endMode of EMBED_END_MODES) {
      expect(parseEmbedParams({ end: endMode }).endMode).toBe(endMode)
    }
    expect(parseEmbedParams({ end: "restart" }).endMode).toBe(DEFAULT_EMBED_PARAMS.endMode)
  })

  it("normalizes optional done text", () => {
    expect(parseEmbedParams({ done: "  Sale ended\nnow  " }).doneText).toBe("Sale ended now")
    expect(parseEmbedParams({ done: "" }).doneText).toBeNull()
    expect(parseEmbedParams({ done: " ".repeat(8) }).doneText).toBeNull()
    expect(parseEmbedParams({ done: "x".repeat(EMBED_DONE_TEXT_MAX_LENGTH + 5) }).doneText).toHaveLength(
      EMBED_DONE_TEXT_MAX_LENGTH,
    )
  })

  it("uses the first value when a param repeats", () => {
    expect(parseEmbedParams({ layout: ["square", "text"] }).layout).toBe("square")
    expect(parseEmbedParams({ accent: ["#e85d2a", "112233"] }).accent).toBe("#e85d2a")
    expect(parseEmbedParams({ done: ["Finished", "Ignored"] }).doneText).toBe("Finished")
  })
})

describe("parseHexColor", () => {
  it("normalizes valid 6-digit colors", () => {
    expect(parseHexColor("AABBCC")).toBe("#aabbcc")
    expect(parseHexColor("#aabbcc")).toBe("#aabbcc")
  })

  it("expands valid 3-digit colors", () => {
    expect(parseHexColor("abc")).toBe("#aabbcc")
    expect(parseHexColor("f0a")).toBe("#ff00aa")
    expect(parseHexColor("#F0A")).toBe("#ff00aa")
  })

  it("rejects invalid colors", () => {
    expect(parseHexColor(undefined)).toBeNull()
    expect(parseHexColor("")).toBeNull()
    expect(parseHexColor("zzz")).toBeNull()
    expect(parseHexColor("abcd")).toBeNull()
    expect(parseHexColor("#aabbcc11")).toBeNull()
    expect(parseHexColor("zzzzzz")).toBeNull()
  })
})

describe("embedQueryString", () => {
  it("returns an empty string when everything is at its default", () => {
    expect(embedQueryString({})).toBe("")
    expect(embedQueryString(DEFAULT_EMBED_PARAMS)).toBe("")
  })

  it("includes only non-default params", () => {
    expect(embedQueryString({ layout: "square" })).toBe("?layout=square")
    expect(embedQueryString({ theme: "dark", font: "mono" })).toBe("?theme=dark&font=mono")
    expect(embedQueryString({ theme: "auto" })).toBe("?theme=auto")
    expect(embedQueryString({ theme: "light" })).toBe("")
    expect(embedQueryString({ scale: 1.25 })).toBe("?scale=1.25")
  })

  it("strips the # from colors and keeps bg=transparent", () => {
    expect(embedQueryString({ accent: "#e85d2a" })).toBe("?accent=e85d2a")
    expect(embedQueryString({ bg: "#112233" })).toBe("?bg=112233")
    expect(embedQueryString({ bg: "transparent" })).toBe("?bg=transparent")
  })

  it("encodes the off toggles", () => {
    expect(embedQueryString({ labels: false, showTarget: false })).toBe("?labels=off&target=off")
    expect(embedQueryString({ labels: true, showTarget: true })).toBe("")
  })

  it("encodes end behavior and optional done text", () => {
    expect(embedQueryString({ endMode: "countup" })).toBe("?end=countup")
    expect(embedQueryString({ endMode: "auto" })).toBe("")
    expect(embedQueryString({ doneText: "Sale ended" })).toBe("?done=Sale+ended")
    expect(embedQueryString({ endMode: "message", doneText: "Sale ended" })).toBe("?end=message&done=Sale+ended")
  })

  it("round-trips through parseEmbedParams", () => {
    const params = parseEmbedParams({
      layout: "horizontal",
      theme: "dark",
      bg: "transparent",
      accent: "e85d2a",
      scale: "1.25",
      labels: "off",
      target: "off",
      end: "message",
      done: "Sale ended",
    })
    const query = embedQueryString(params)
    const reparsed = parseEmbedParams(Object.fromEntries(new URLSearchParams(query.slice(1))))
    expect(reparsed).toEqual(params)
  })
})

import { readFile } from "node:fs/promises"

type FontWeight = 400 | 500 | 600

type OgFont = {
  name: string
  data: ArrayBuffer
  weight: FontWeight
  style: "normal"
}

const fontFiles: ReadonlyArray<{ name: string; weight: FontWeight; url: URL }> = [
  { name: "Geist", weight: 400, url: new URL("../../assets/fonts/og/Geist-Regular.ttf", import.meta.url) },
  { name: "Geist", weight: 500, url: new URL("../../assets/fonts/og/Geist-Medium.ttf", import.meta.url) },
  { name: "Geist", weight: 600, url: new URL("../../assets/fonts/og/Geist-SemiBold.ttf", import.meta.url) },
  { name: "Geist Mono", weight: 400, url: new URL("../../assets/fonts/og/GeistMono-Regular.ttf", import.meta.url) },
  { name: "Geist Mono", weight: 500, url: new URL("../../assets/fonts/og/GeistMono-Medium.ttf", import.meta.url) },
  { name: "Geist Mono", weight: 600, url: new URL("../../assets/fonts/og/GeistMono-SemiBold.ttf", import.meta.url) },
]

let fontsPromise: Promise<OgFont[]> | null = null

async function readFont(url: URL) {
  const buffer = await readFile(url)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

export function loadOgFonts() {
  fontsPromise ??= Promise.all(
    fontFiles.map(async (font) => ({
      name: font.name,
      data: await readFont(font.url),
      weight: font.weight,
      style: "normal" as const,
    })),
  ).catch((error: unknown) => {
    fontsPromise = null
    throw error
  })

  return fontsPromise
}

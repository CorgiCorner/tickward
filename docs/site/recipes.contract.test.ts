import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const docsSiteDir = path.resolve(import.meta.dirname)

const canon = {
  anniversary: {
    mode: "since",
    milestones: { rules: [{ unit: "years", every: 1 }] },
    reminders: [{ offset_minutes: 0 }, { offset_minutes: 1440 }],
  },
  monthiversary: {
    mode: "since",
    milestones: {
      rules: [
        { unit: "months", every: 1 },
        { unit: "years", every: 1 },
      ],
    },
    reminders: [{ offset_minutes: 0 }],
  },
  "recovery-ladder": {
    mode: "since",
    milestones: {
      rules: [
        { unit: "days", at: [1, 3] },
        { unit: "weeks", at: [1] },
        { unit: "months", at: [1, 3] },
        { unit: "years", at: [1] },
      ],
    },
    reminders: [{ offset_minutes: 0 }],
  },
  streak: {
    mode: "since",
    milestones: { rules: [{ unit: "weeks", every: 1 }] },
    reminders: [{ offset_minutes: 0 }],
  },
} as const

type RecipeId = keyof typeof canon

function compiledFields(payload: Record<string, unknown>) {
  return {
    mode: payload.mode,
    milestones: payload.milestones,
    reminders: payload.reminders,
  }
}

function recipePayloadsFromGuide() {
  const guide = readFileSync(path.join(docsSiteDir, "guides/recipes.mdx"), "utf8")
  return Object.fromEntries(
    Object.keys(canon).map((recipeId) => {
      const marker = `<!-- recipe:${recipeId} -->`
      const afterMarker = guide.split(marker)[1]
      const json = afterMarker?.match(/```json\n([\s\S]*?)\n```/)?.[1]
      if (!json) throw new Error(`Missing JSON payload after ${marker}`)
      return [recipeId, JSON.parse(json) as Record<string, unknown>]
    }),
  ) as Record<RecipeId, Record<string, unknown>>
}

function recipePayloadsFromOpenApi() {
  const openapi = JSON.parse(readFileSync(path.join(docsSiteDir, "openapi.json"), "utf8"))
  return openapi.components.requestBodies.TimerCreate.content["application/json"].examples as Record<
    RecipeId,
    { value: Record<string, unknown> }
  >
}

describe("since timer recipe canon", () => {
  it("publishes byte-identical compiled fields in the guide and OpenAPI examples", () => {
    const guidePayloads = recipePayloadsFromGuide()
    const openApiExamples = recipePayloadsFromOpenApi()

    expect(Object.keys(openApiExamples).sort()).toEqual(Object.keys(canon).sort())

    for (const recipeId of Object.keys(canon) as RecipeId[]) {
      const expected = JSON.stringify(canon[recipeId])
      expect(JSON.stringify(compiledFields(guidePayloads[recipeId]))).toBe(expected)
      expect(JSON.stringify(compiledFields(openApiExamples[recipeId].value))).toBe(expected)
    }
  })
})

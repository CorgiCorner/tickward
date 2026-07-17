import { describe, expect, it } from "vitest"

import { projectReorderRequestSchema } from "@/lib/project-reorder"

describe("project reorder request schema", () => {
  it("accepts a valid ordered project id list", () => {
    expect(projectReorderRequestSchema.safeParse({ projectIds: ["project_one", "project_two"] }).success).toBe(true)
  })

  it("rejects an empty project id list", () => {
    expect(projectReorderRequestSchema.safeParse({ projectIds: [] }).success).toBe(false)
  })

  it("rejects more than 100 project ids", () => {
    const projectIds = Array.from({ length: 101 }, (_, index) => `project_${index}`)

    expect(projectReorderRequestSchema.safeParse({ projectIds }).success).toBe(false)
  })

  it("rejects invalid project ids", () => {
    expect(projectReorderRequestSchema.safeParse({ projectIds: ["bad id"] }).success).toBe(false)
  })

  it("rejects duplicate project ids", () => {
    expect(projectReorderRequestSchema.safeParse({ projectIds: ["project_one", "project_one"] }).success).toBe(false)
  })
})

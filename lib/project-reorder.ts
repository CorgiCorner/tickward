import { z } from "zod"

import { isValidProjectId } from "@/lib/project-model"

export const projectReorderRequestSchema = z.object({
  projectIds: z
    .array(z.string().refine(isValidProjectId, { message: "Invalid project id." }))
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Duplicate project id." }),
})

export type ProjectReorderRequest = z.infer<typeof projectReorderRequestSchema>

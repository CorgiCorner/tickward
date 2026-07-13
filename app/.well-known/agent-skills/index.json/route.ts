import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { getSiteOrigin } from "@/lib/site-config"

export const runtime = "nodejs"

const AGENT_SKILLS_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json"

type SkillMeta = { name: string; description: string; digest: string | null }

let cachedMeta: SkillMeta | undefined

// Read the published skill artifact once to derive its name, description, and
// integrity digest so the discovery index stays in sync with skill.md.
function readSkillMeta(): SkillMeta {
  if (cachedMeta) return cachedMeta

  let name = "tickward"
  let description = ""
  let digest: string | null = null

  try {
    const contents = readFileSync(join(process.cwd(), "skill.md"))
    digest = `sha256:${createHash("sha256").update(contents).digest("hex")}`
    const text = contents.toString("utf8")
    const nameMatch = /^name:\s*(.+)$/m.exec(text)
    const descriptionMatch = /^description:\s*(.+)$/m.exec(text)
    if (nameMatch?.[1]) name = nameMatch[1].trim()
    if (descriptionMatch?.[1]) description = descriptionMatch[1].trim()
  } catch {
    // Keep the index discoverable even if the artifact cannot be read; the
    // digest is simply omitted in that degraded case.
  }

  cachedMeta = { name, description, digest }
  return cachedMeta
}

// Agent Skills discovery index (Agent Skills Discovery RFC v0.2.0).
export function GET() {
  const siteOrigin = getSiteOrigin()
  const { name, description, digest } = readSkillMeta()

  const index = {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: [
      {
        name,
        type: "skill-md",
        description,
        url: `${siteOrigin}/skill.md`,
        ...(digest ? { digest } : {}),
      },
    ],
  }

  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}

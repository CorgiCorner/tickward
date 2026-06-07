import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const schemaPath = "prisma/schema.prisma"

if (!existsSync(schemaPath)) {
  console.log(`Skipping prisma generate because ${schemaPath} is not present.`)
  process.exit(0)
}

const result = spawnSync("prisma", ["generate", "--schema", schemaPath], {
  shell: process.platform === "win32",
  stdio: "inherit",
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)

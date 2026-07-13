import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { resolveTrustedExecutable } from "./trusted-executable.mjs"

const schemaPath = "prisma/schema.prisma"

if (!existsSync(schemaPath)) {
  console.log(`Skipping prisma generate because ${schemaPath} is not present.`)
  process.exit(0)
}

const prismaExecutable = resolveTrustedExecutable("prisma", {
  candidates: [path.resolve("node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma")],
})
const result = spawnSync(prismaExecutable, ["generate", "--schema", schemaPath], {
  shell: process.platform === "win32",
  stdio: "inherit",
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)

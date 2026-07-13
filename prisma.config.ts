import "dotenv/config"

import { defineConfig } from "prisma/config"

// Prisma loads this config for commands such as `generate` that do not connect
// to the database. Keep that path usable without committing development
// credentials; commands that connect still receive their URL from the env.
const datasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://localhost/tickward"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
})

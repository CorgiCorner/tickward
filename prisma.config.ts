import "dotenv/config"

import { defineConfig } from "prisma/config"

const datasourceUrl =
  process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://tickward:tickward@localhost:5432/tickward"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
})

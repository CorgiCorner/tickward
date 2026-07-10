import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "storybook-static/**",
    "next-env.d.ts",
    "worktrees/**",
    "**/worktrees/**",
    ".worktrees/**",
    "**/.worktrees/**",
    // Private design prototypes + vendored Framer support script are not app
    // source and must not gate lint/release.
    "design/**",
  ]),
  {
    // Future API server files that read tenant models should be added here.
    files: ["lib/public-api-v1.server.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(findMany|findFirst|findUnique|count|aggregate)$/][callee.object.type='MemberExpression'][callee.object.property.name=/^(project|timer|space)$/]",
          message: "use tenantDb(user) from lib/tenant-db.server.ts",
        },
      ],
    },
  },
])

export default eslintConfig

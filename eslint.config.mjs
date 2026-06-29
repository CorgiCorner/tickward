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
])

export default eslintConfig

import path from "node:path"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const sharedTestConfig = {
  css: true,
  environment: "jsdom",
  globals: true,
  setupFiles: ["./test/setup.ts"],
  testTimeout: 10000,
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "test/shims/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: "unit",
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["storybook-static/**", "**/node_modules/**", ".worktrees/**", "**/.worktrees/**"],
        },
      },
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.resolve(__dirname, ".storybook") })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.*",
        "**/*.stories.*",
        "**/*.d.ts",
        ".next/**",
        ".storybook/**",
        "design/**",
        "lib/generated/**",
        "prisma/generated/**",
        "scripts/**",
        "storybook-static/**",
        "test/**",
      ],
      // Ratchet baseline for public all-files coverage; raise as gaps close.
      thresholds: {
        statements: 67,
        branches: 58,
        functions: 69,
        lines: 70,
      },
    },
  },
})

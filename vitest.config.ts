import path from "node:path"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const sharedTestConfig = {
  css: true,
  environment: "jsdom",
  globals: true,
  setupFiles: ["./test/setup.ts"],
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
          exclude: ["storybook-static/**", "**/node_modules/**", ".claude/**"],
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
      include: [
        "app/api/projects/**/route.ts",
        "app/api/share/create/route.ts",
        "app/api/share/status/route.ts",
        "components/countdown-display.tsx",
        "components/use-notifications.ts",
        "lib/auth/auth.server.ts",
        "lib/auth/email-otp.server.ts",
        "lib/project-model.ts",
        "lib/project-storage.client.ts",
        "lib/share-model.ts",
        "lib/utils.ts",
        "lib/validate.ts",
      ],
      exclude: ["**/*.test.*", "test/**"],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
})

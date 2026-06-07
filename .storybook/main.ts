import path from "node:path"

import type { StorybookConfig } from "@storybook/nextjs-vite"

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {
      nextConfigPath: path.resolve(process.cwd(), "next.config.ts"),
    },
  },
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    config.resolve ??= {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.resolve(process.cwd()),
      "next-themes": path.resolve(process.cwd(), ".storybook/next-themes.mock.tsx"),
    }
    return config
  },
}

export default config

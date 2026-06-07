import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { ProjectSwitcher } from "@/components/project-switcher"
import { TimerStorePreview } from "@/components/storybook/timer-store-preview"

const meta = {
  title: "App/ProjectSwitcher",
  component: ProjectSwitcher,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <TimerStorePreview>
        <Story />
      </TimerStorePreview>
    ),
  ],
} satisfies Meta<typeof ProjectSwitcher>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NarrowContainer: Story = {
  render: () => (
    <div className="w-44">
      <ProjectSwitcher />
    </div>
  ),
}

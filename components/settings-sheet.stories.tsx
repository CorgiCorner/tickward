import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { userEvent, within } from "storybook/test"

import { SettingsSheet } from "@/components/settings-sheet"
import { TimerStorePreview } from "@/components/storybook/timer-store-preview"

const meta = {
  title: "App/SettingsSheet",
  component: SettingsSheet,
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
} satisfies Meta<typeof SettingsSheet>

export default meta

type Story = StoryObj<typeof meta>

export const Trigger: Story = {}

export const ProjectSettings: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Project settings" }))
    await within(document.body).findByLabelText("Name")
  },
}

import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { QuickAddTimer } from "@/components/quick-add-timer"
import { TimerStorePreview } from "@/components/storybook/timer-store-preview"

const meta = {
  title: "App/QuickAddTimer",
  component: QuickAddTimer,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <TimerStorePreview>
        <div className="w-[min(720px,calc(100vw-3rem))]">
          <Story />
        </div>
      </TimerStorePreview>
    ),
  ],
} satisfies Meta<typeof QuickAddTimer>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { TimerForm } from "@/components/timer-form"
import { TimerStorePreview, storybookTimers } from "@/components/storybook/timer-store-preview"

const meta = {
  title: "App/TimerForm",
  component: TimerForm,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <TimerStorePreview>
        <div className="min-h-[560px] w-[min(640px,calc(100vw-3rem))]">
          <Story />
        </div>
      </TimerStorePreview>
    ),
  ],
} satisfies Meta<typeof TimerForm>

export default meta

type Story = StoryObj<typeof meta>

export const CreateOpen: Story = {
  args: {
    mode: "create",
    open: true,
    onOpenChange: () => {},
    onSubmit: (timer) => {
      console.log("storybook timer submit", timer)
    },
  },
}

export const EditOpen: Story = {
  args: {
    mode: "edit",
    initial: storybookTimers[0],
    open: true,
    onOpenChange: () => {},
    onSubmit: (timer) => {
      console.log("storybook timer update", timer)
    },
  },
}

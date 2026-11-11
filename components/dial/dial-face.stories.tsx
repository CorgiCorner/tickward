import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { DialFace } from "./dial-face"

const meta = {
  title: "Dial/DialFace",
  component: DialFace,
  args: {
    progress: 28.4,
    color: "rgb(37, 99, 235)",
    readout: { value: 1, unit: "day", clock: "04:00:00" },
  },
  decorators: [
    (Story) => (
      <div className="grid place-items-center py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DialFace>

export default meta

type Story = StoryObj<typeof meta>

export const HourScale: Story = {}

export const LeadingTick: Story = {
  args: { progress: 12.62, color: "rgb(13, 148, 136)", readout: { value: 21, unit: "hours", clock: "45:00" } },
}

export const Full: Story = {
  args: { progress: 60, color: "rgb(124, 58, 237)", readout: { value: 1300, unit: "days", clock: "00:12:44" } },
}

export const Empty: Story = {
  args: { progress: 0, readout: { value: 0, unit: "hours", clock: "00:00" } },
}

export const Dark: Story = {
  args: { progress: 44.3, color: "rgb(217, 119, 6)", readout: { value: 3, unit: "days", clock: "22:30:00" } },
  decorators: [
    (Story) => (
      <div className="dark rounded-[16px] bg-background p-8 text-foreground">
        <Story />
      </div>
    ),
  ],
}

export const Focus: Story = {
  args: { size: "focus", progress: 52.2, readout: { value: 4, unit: "hours", clock: "12:09" } },
}

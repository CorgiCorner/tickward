import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { CountdownDisplay } from "@/components/countdown-display"
import { storybookNowMs } from "@/components/storybook/timer-store-preview"

const meta = {
  title: "App/CountdownDisplay",
  component: CountdownDisplay,
  parameters: {
    layout: "centered",
  },
  args: {
    nowMs: storybookNowMs,
    targetDateIsoUtc: "2026-06-10T12:00:00.000Z",
  },
} satisfies Meta<typeof CountdownDisplay>

export default meta

type Story = StoryObj<typeof meta>

export const Future: Story = {}

export const CountUp: Story = {
  args: {
    targetDateIsoUtc: "2026-06-01T12:00:00.000Z",
  },
}

export const Muted: Story = {
  args: {
    muted: true,
    targetDateIsoUtc: "2026-06-04T09:30:00.000Z",
  },
}

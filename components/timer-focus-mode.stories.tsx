import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { TimerFocusMode } from "@/components/timer-focus-mode"
import { storybookNowMs } from "@/components/storybook/timer-store-preview"

const meta = {
  title: "App/TimerFocusMode",
  component: TimerFocusMode,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    open: true,
    timerLabel: "Pack for Lisbon",
    targetDateIsoUtc: "2026-06-10T12:00:00.000Z",
    nowMs: storybookNowMs,
    onClose: () => undefined,
  },
} satisfies Meta<typeof TimerFocusMode>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CountUp: Story = {
  args: {
    timerLabel: "Deep work block",
    targetDateIsoUtc: "2026-06-01T12:00:00.000Z",
  },
}

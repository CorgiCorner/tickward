import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { TimerFocusMode } from "@/components/timer-focus-mode"
import { storybookNowMs } from "@/components/storybook/timer-store-preview"
import type { Timer } from "@/lib/types"

const train: Timer = {
  id: "story-train",
  label: "Train to Gdansk",
  description: "Tickets are in the wallet. Pack the charger before leaving.",
  targetDate: "2026-11-11T15:00:00.000Z",
  timezone: "Europe/Warsaw",
  createdAt: "2026-11-10T09:00:00.000Z",
  color: "#2563eb",
  reminders: [{ offsetMinutes: 0 }, { offsetMinutes: 1440 }],
}

const sinceWeMet: Timer = {
  id: "story-since-we-met",
  label: "Since we met",
  description: "The evening at the lake.",
  targetDate: "2023-04-20T16:00:00.000Z",
  timezone: "UTC",
  createdAt: "2023-04-20T16:00:00.000Z",
  color: "#7759e6",
  mode: "since",
  milestones: {
    rules: [
      { unit: "days", every: 100 },
      { unit: "years", every: 1 },
    ],
  },
}

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

export const CountdownWithReminders: Story = {
  args: {
    timerLabel: train.label,
    targetDateIsoUtc: train.targetDate,
    timer: train,
    accentColor: train.color,
    nowMs: Date.parse("2026-11-10T11:28:51.000Z"),
  },
}

export const CountUpWithMilestones: Story = {
  args: {
    timerLabel: sinceWeMet.label,
    targetDateIsoUtc: sinceWeMet.targetDate,
    timer: sinceWeMet,
    accentColor: sinceWeMet.color,
    nowMs: Date.parse("2026-12-01T09:30:12.000Z"),
  },
}

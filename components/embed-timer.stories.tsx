import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { EmbedTimer, EmbedUnavailableCard } from "@/components/embed-timer"
import { storybookNowMs } from "@/components/storybook/timer-store-preview"

const meta = {
  title: "App/EmbedTimer",
  component: EmbedTimer,
  parameters: {
    layout: "centered",
  },
  args: {
    label: "Product launch",
    // storybookNowMs is 2026-06-03T08:00:00Z; target ~12 days out.
    targetDateIsoUtc: "2026-06-15T18:00:00.000Z",
    timezone: "Europe/Warsaw",
    layout: "compact",
    attribution: { label: "tickward.com", href: "https://tickward.com/?ref=embed" },
    nowMs: storybookNowMs,
  },
} satisfies Meta<typeof EmbedTimer>

export default meta

type Story = StoryObj<typeof meta>

export const Text: Story = {
  args: {
    layout: "text",
  },
}

export const Minimal: Story = {
  args: {
    layout: "minimal",
  },
}

export const Compact: Story = {
  args: {
    layout: "compact",
  },
}

export const Square: Story = {
  args: {
    layout: "square",
  },
}

export const Horizontal: Story = {
  args: {
    layout: "horizontal",
  },
}

export const Accent: Story = {
  args: {
    layout: "square",
    accent: "#e85d2a",
  },
}

export const NoLabels: Story = {
  args: {
    layout: "square",
    labels: false,
  },
}

export const NoTarget: Story = {
  args: {
    layout: "square",
    showTarget: false,
  },
}

export const CountUp: Story = {
  args: {
    label: "Since launch",
    targetDateIsoUtc: "2026-05-20T09:30:00.000Z",
  },
}

export const Finished: Story = {
  args: {
    // Mounted one second before the target and observed one second after:
    // the countdown crossed zero while mounted, so the transient "finished"
    // state renders instead of the count-up "since".
    targetDateIsoUtc: new Date(storybookNowMs).toISOString(),
    initialNowMs: storybookNowMs - 1_000,
    nowMs: storybookNowMs + 1_000,
  },
}

export const CustomFinishedMessage: Story = {
  args: {
    doneText: "Sale ended",
    endMode: "message",
    targetDateIsoUtc: "2026-05-20T09:30:00.000Z",
  },
}

export const CountUpEnd: Story = {
  args: {
    endMode: "countup",
    targetDateIsoUtc: new Date(storybookNowMs).toISOString(),
    initialNowMs: storybookNowMs - 1_000,
    nowMs: storybookNowMs + 1_000,
  },
}

export const Transparent: Story = {
  args: {
    layout: "square",
    transparent: true,
  },
}

export const LongHorizon: Story = {
  args: {
    layout: "square",
    // ~735 days after storybookNowMs.
    targetDateIsoUtc: "2028-06-07T12:00:00.000Z",
  },
}

export const Unavailable: Story = {
  render: (args) => <EmbedUnavailableCard attribution={args.attribution} />,
}

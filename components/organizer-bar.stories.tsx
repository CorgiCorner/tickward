import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { OrganizerBar } from "@/components/organizer-bar"
import { TimerStorePreview, storybookSpaces, storybookTimers } from "@/components/storybook/timer-store-preview"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"

const meta = {
  title: "App/OrganizerBar",
  component: OrganizerBar,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[min(640px,calc(100vw-3rem))]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OrganizerBar>

export default meta

type Story = StoryObj<typeof meta>

export const WithSpaces: Story = {
  render: () => (
    <TimerStorePreview timers={storybookTimers} spaces={storybookSpaces} activeSpaceId="space-work">
      <OrganizerBar />
    </TimerStorePreview>
  ),
}

export const UnassignedActive: Story = {
  render: () => (
    <TimerStorePreview
      timers={[
        ...storybookTimers,
        {
          ...storybookTimers[0],
          id: "timer-unassigned",
          label: "Personal reminder",
          spaceId: undefined,
          pinned: undefined,
        },
      ]}
      spaces={storybookSpaces}
      activeSpaceId={UNASSIGNED_SPACE_ID}
    >
      <OrganizerBar />
    </TimerStorePreview>
  ),
}

export const Filtered: Story = {
  render: () => (
    <TimerStorePreview
      timers={[
        ...storybookTimers,
        {
          ...storybookTimers[0],
          id: "timer-shared",
          label: "Shared product demo",
          sharedAt: "2026-06-03T09:00:00.000Z",
          pinned: undefined,
        },
      ]}
      spaces={storybookSpaces}
      activeSpaceId={null}
      timerFilters={{ notifications: false, shared: true }}
    >
      <OrganizerBar />
    </TimerStorePreview>
  ),
}

export const NoSpaces: Story = {
  render: () => (
    <TimerStorePreview timers={storybookTimers} spaces={[]} activeSpaceId={null}>
      <OrganizerBar />
    </TimerStorePreview>
  ),
}

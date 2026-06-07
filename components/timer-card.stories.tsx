import { DndContext } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { TimerCard } from "@/components/timer-card"
import { TimerStorePreview, storybookNowMs } from "@/components/storybook/timer-store-preview"
import type { Timer } from "@/lib/types"

const baseTimer: Timer = {
  id: "timer-public-launch",
  label: "Public launch",
  targetDate: "2026-06-10T12:00:00.000Z",
  timezone: "UTC",
  createdAt: "2026-06-03T08:00:00.000Z",
  updatedAt: "2026-06-03T08:00:00.000Z",
  description: "Release the public open-core snapshot.",
  spaceId: "space-work",
}

const timerStates: Timer[] = [
  {
    ...baseTimer,
    id: "timer-default",
    label: "Default timer",
  },
  {
    ...baseTimer,
    id: "timer-pinned",
    label: "Pinned deadline",
    pinned: true,
  },
  {
    ...baseTimer,
    id: "timer-archived",
    label: "Archived milestone",
    archivedAt: "2026-06-02T18:00:00.000Z",
  },
  {
    ...baseTimer,
    id: "timer-followed",
    label: "Followed from share",
    sourceShareId: "share_public_launch",
  },
  {
    ...baseTimer,
    id: "timer-recurring",
    label: "Daily standup",
    targetDate: "2026-05-29T08:30:00.000Z",
    recurrence: { type: "daily", enabled: true },
  },
  {
    ...baseTimer,
    id: "timer-with-photo",
    label: "Lisbon trip",
    description: "Flights, hotel and checklist.",
    image: {
      unsplashId: "storybook-lisbon",
      url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
      thumbUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=320",
      authorName: "Storybook",
      authorUrl: "https://unsplash.com",
    },
  },
  {
    ...baseTimer,
    id: "timer-count-up",
    label: "Launch shipped",
    targetDate: "2026-06-01T12:00:00.000Z",
  },
]

function TimerCardFrame(props: Readonly<{ timers: Timer[] }>) {
  return (
    <TimerStorePreview timers={props.timers} activeSpaceId={null}>
      <DndContext>
        <SortableContext items={props.timers.map((timer) => timer.id)} strategy={verticalListSortingStrategy}>
          <div className="grid w-[min(640px,calc(100vw-3rem))] gap-4">
            {props.timers.map((timer) => (
              <TimerCard key={timer.id} timer={timer} nowMs={storybookNowMs} sortable={false} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </TimerStorePreview>
  )
}

const meta = {
  title: "App/TimerCard",
  component: TimerCard,
  args: {
    timer: baseTimer,
    nowMs: storybookNowMs,
    sortable: false,
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof TimerCard>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <TimerCardFrame timers={[timerStates[0]]} />,
}

export const Pinned: Story = {
  render: () => <TimerCardFrame timers={[timerStates[1]]} />,
}

export const Archived: Story = {
  render: () => <TimerCardFrame timers={[timerStates[2]]} />,
}

export const Followed: Story = {
  render: () => <TimerCardFrame timers={[timerStates[3]]} />,
}

export const Recurring: Story = {
  render: () => <TimerCardFrame timers={[timerStates[4]]} />,
}

export const WithPhoto: Story = {
  render: () => <TimerCardFrame timers={[timerStates[5]]} />,
}

export const CountUp: Story = {
  render: () => <TimerCardFrame timers={[timerStates[6]]} />,
}

export const StateMatrix: Story = {
  render: () => <TimerCardFrame timers={timerStates} />,
}

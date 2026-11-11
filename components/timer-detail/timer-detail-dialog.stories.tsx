import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { TimerDetailDialog } from "@/components/timer-detail/timer-detail-dialog"
import { TimerDetailOpener } from "@/components/timer-detail/timer-detail-opener"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import type { Space, Timer } from "@/lib/types"

const nowMs = Date.parse("2026-11-10T16:12:44.000Z")

const space: Space = { id: "space-soon", name: "Coming up", color: "#2563eb", createdAt: "2026-11-01T00:00:00.000Z" }

const sinceWeMet: Timer = {
  id: "story-since-we-met",
  label: "Since we met",
  description: "The evening at the lake.",
  targetDate: "2023-04-20T16:00:00.000Z",
  timezone: "UTC",
  createdAt: "2026-11-10T09:00:00.000Z",
  sharedAt: "2026-11-10T09:00:00.000Z",
  spaceId: space.id,
  color: "#7759e6",
  mode: "since",
  milestones: {
    rules: [
      { unit: "days", every: 100 },
      { unit: "years", every: 1 },
    ],
  },
}

const birthday: Timer = {
  id: "story-birthday",
  label: "Marta's birthday",
  description: "Order the cake by Tuesday and hide the candles before she visits.",
  targetDate: "2026-11-16T17:00:00.000Z",
  timezone: "Europe/Warsaw",
  createdAt: "2026-11-09T09:00:00.000Z",
  color: "#7c3aed",
  reminders: [{ offsetMinutes: 1440 }, { offsetMinutes: 60 }],
}

const menuItems = (
  <>
    <DropdownMenuItem>Pin</DropdownMenuItem>
    <DropdownMenuItem>Archive</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
  </>
)

const meta = {
  title: "App/TimerDetail",
  component: TimerDetailDialog,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onOpenChange: () => undefined,
    timer: sinceWeMet,
    space,
    signedIn: true,
    nowMs,
    onEdit: () => undefined,
    onShare: () => undefined,
    onFocus: () => undefined,
    onCopyShareLink: () => undefined,
    menuItems,
  },
} satisfies Meta<typeof TimerDetailDialog>

export default meta

type Story = StoryObj<typeof meta>

export const CountUpMilestoneDay: Story = {}

export const CountUpOrdinaryDay: Story = {
  args: { nowMs: Date.parse("2026-12-01T09:30:12.000Z") },
}

export const Countdown: Story = {
  args: {
    timer: birthday,
    space: undefined,
    nowMs: Date.parse("2026-11-10T10:49:57.000Z"),
    onCopyShareLink: undefined,
  },
}

export const CountdownSignedOut: Story = {
  args: { ...Countdown.args, signedIn: false },
}

export const FollowedTimer: Story = {
  args: { onEdit: undefined, menuItems: undefined },
}

export const FromCard: Story = {
  args: { open: false },
  render: (args) => (
    <div className="mx-auto grid max-w-[640px] gap-3 sm:grid-cols-2">
      {[sinceWeMet, birthday].map((timer) => (
        <article key={timer.id} className="relative rounded-[12px] border border-border bg-card px-4 pb-6 pt-4">
          <h4 className="text-sm font-semibold">{timer.label}</h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{timer.description}</p>
          <TimerDetailOpener
            timer={timer}
            space={timer.spaceId ? space : undefined}
            signedIn={args.signedIn}
            nowMs={args.nowMs}
            onEdit={args.onEdit}
            onShare={args.onShare}
            onFocus={args.onFocus}
            menuItems={args.menuItems}
          />
        </article>
      ))}
    </div>
  ),
}

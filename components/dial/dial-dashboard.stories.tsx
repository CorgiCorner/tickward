import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite"
import { EllipsisVerticalIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import type { Timer } from "@/lib/types"

import { DialClockProvider, fixedDialClock, offsetDialClock } from "./dial-clock"
import { DialDashboard, type DialDashboardProps } from "./dial-dashboard"
import { dialDemoNowMs, dialDemoTimerList, dialLongTimer } from "./dial.fixtures"
import { createMemoryMomentLedger } from "./milestone-moment"

// The clock starts at the demo instant and runs, so the dial ticks in the story. The Frozen
// story stops it for stable screenshots.
function DashboardStory(props: Readonly<DialDashboardProps & { frozen?: boolean }>) {
  const { frozen, ...dashboard } = props
  const clock = useMemo(() => (frozen ? fixedDialClock(dialDemoNowMs) : offsetDialClock(dialDemoNowMs)), [frozen])
  const [timers, setTimers] = useState<ReadonlyArray<Timer>>(dashboard.timers)
  // A fresh ledger per story load: the milestone moment plays every time the story opens.
  const [momentLedger] = useState(createMemoryMomentLedger)
  return (
    <DialClockProvider clock={clock}>
      <DialDashboard
        allowMomentReplay
        momentLedger={momentLedger}
        {...dashboard}
        timers={timers}
        onTogglePin={(timer) =>
          setTimers((current) =>
            current.map((entry) => (entry.id === timer.id ? { ...entry, pinned: !entry.pinned } : entry)),
          )
        }
        renderActions={() => (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Open timer actions"
          >
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        )}
      />
    </DialClockProvider>
  )
}

const desktop: Decorator = (Story) => (
  <div className="mx-auto w-full max-w-[992px]">
    <Story />
  </div>
)

const phone: Decorator = (Story) => (
  <div className="mx-auto w-full max-w-[358px]">
    <Story />
  </div>
)

const dark: Decorator = (Story) => (
  <div className="dark -m-6 min-h-screen bg-background p-6 text-foreground [color-scheme:dark]">
    <Story />
  </div>
)

const meta = {
  title: "Dial/DialDashboard",
  component: DashboardStory,
  parameters: { layout: "fullscreen" },
  args: {
    timers: dialDemoTimerList,
  },
} satisfies Meta<typeof DashboardStory>

export default meta

type Story = StoryObj<typeof meta>

export const Countdown: Story = { decorators: [desktop] }

export const Repeating: Story = {
  args: { defaultSelectedId: "herbs" },
  decorators: [desktop],
}

export const CountUp: Story = {
  args: { defaultSelectedId: "parcel" },
  decorators: [desktop],
}

export const MilestoneDay: Story = {
  args: { defaultSelectedId: "met" },
  decorators: [desktop],
}

export const LongNumber: Story = {
  args: { timers: [dialLongTimer, ...dialDemoTimerList.map((timer) => ({ ...timer, pinned: false }))] },
  decorators: [desktop],
}

export const Dark: Story = {
  decorators: [desktop, dark],
}

export const DarkMilestoneDay: Story = {
  args: { defaultSelectedId: "met" },
  decorators: [desktop, dark],
}

export const Phone: Story = {
  decorators: [phone],
}

export const PhoneDark: Story = {
  args: { defaultSelectedId: "met" },
  decorators: [phone, dark],
}

export const FocusMode: Story = {
  args: { defaultFocusOpen: true },
  decorators: [desktop],
}

export const FocusModeDark: Story = {
  args: { defaultFocusOpen: true, defaultSelectedId: "met" },
  decorators: [desktop, dark],
}

export const Frozen: Story = {
  args: { frozen: true },
  decorators: [desktop],
}

export const Empty: Story = {
  args: { timers: [] },
  decorators: [desktop],
}

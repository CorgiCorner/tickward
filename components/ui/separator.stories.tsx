import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { Separator } from "@/components/ui/separator"

const meta = {
  title: "UI/Separator",
  component: Separator,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Separator>

export default meta

type Story = StoryObj<typeof meta>

export const Horizontal: Story = {
  render: () => (
    <div className="w-80">
      <div className="text-sm font-medium">Project</div>
      <Separator className="my-3" />
      <div className="text-sm text-muted-foreground">Timers, spaces and sync settings.</div>
    </div>
  ),
}

export const Vertical: Story = {
  render: () => (
    <div className="flex h-16 items-center gap-4 text-sm">
      <span>Timers</span>
      <Separator orientation="vertical" />
      <span>Spaces</span>
      <Separator orientation="vertical" />
      <span>Settings</span>
    </div>
  ),
}

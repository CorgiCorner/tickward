import { BellIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { Button } from "@/components/ui/button"

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  args: {
    children: "Create timer",
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Variants: Story = {
  render: () => (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button>
          <PlusIcon className="size-4" />
          Default
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">
          <Trash2Icon className="size-4" />
          Delete
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Notifications">
          <BellIcon className="size-4" />
        </Button>
        <Button loading>Saving</Button>
      </div>
    </div>
  ),
}

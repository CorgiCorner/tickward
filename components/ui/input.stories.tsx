import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  args: {
    placeholder: "Timer name",
  },
} satisfies Meta<typeof Input>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FormRow: Story = {
  render: () => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="storybook-timer-name">Timer name</Label>
      <Input id="storybook-timer-name" defaultValue="Public launch" />
      <p className="text-xs text-muted-foreground">Keep labels short enough to scan on mobile.</p>
    </div>
  ),
}

export const Invalid: Story = {
  render: () => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="storybook-invalid-key">Restore key</Label>
      <Input id="storybook-invalid-key" defaultValue="short" aria-invalid />
      <p className="text-xs text-destructive">Restore keys must be at least 8 characters.</p>
    </div>
  ),
}

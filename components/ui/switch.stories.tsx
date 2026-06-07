import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const meta = {
  title: "UI/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Switch>

export default meta

type Story = StoryObj<typeof meta>

function SwitchDemo() {
  const [checked, setChecked] = useState(true)

  return (
    <label className="flex items-center gap-3">
      <Switch checked={checked} onCheckedChange={setChecked} />
      <span className="text-sm">Notifications</span>
    </label>
  )
}

export const Default: Story = {
  render: () => <SwitchDemo />,
}

export const SettingsRow: Story = {
  render: () => (
    <div className="flex w-80 items-center justify-between rounded-md border p-3">
      <div className="grid gap-1">
        <Label htmlFor="sync">Auto sync</Label>
        <div className="text-xs text-muted-foreground">Save changes in the background.</div>
      </div>
      <Switch id="sync" defaultChecked />
    </div>
  ),
}

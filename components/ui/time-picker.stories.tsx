import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { Label } from "@/components/ui/label"
import { TimePicker } from "@/components/ui/time-picker"

const meta = {
  title: "UI/TimePicker",
  component: TimePicker,
  args: {
    value: "09:00",
    onChange: () => {},
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof TimePicker>

export default meta

type Story = StoryObj<typeof meta>

function TimePickerDemo(props: Readonly<{ initialValue: string }>) {
  const [value, setValue] = useState(props.initialValue)

  return (
    <div className="grid w-72 gap-2">
      <Label>Time</Label>
      <TimePicker value={value} onChange={setValue} />
    </div>
  )
}

export const Default: Story = {
  render: () => <TimePickerDemo initialValue="09:00" />,
}

export const Afternoon: Story = {
  render: () => <TimePickerDemo initialValue="16:30" />,
}

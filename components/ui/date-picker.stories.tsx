import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"

const meta = {
  title: "UI/DatePicker",
  component: DatePicker,
  args: {
    value: "2026-06-10",
    onChange: () => {},
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof DatePicker>

export default meta

type Story = StoryObj<typeof meta>

function DatePickerDemo(props: Readonly<{ initialValue: string }>) {
  const [value, setValue] = useState(props.initialValue)

  return (
    <div className="grid w-72 gap-2">
      <Label>Date</Label>
      <DatePicker value={value} onChange={setValue} />
    </div>
  )
}

export const Default: Story = {
  render: () => <DatePickerDemo initialValue="2026-06-10" />,
}

export const Empty: Story = {
  render: () => <DatePickerDemo initialValue="" />,
}

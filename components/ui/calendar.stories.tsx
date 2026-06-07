import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { Calendar } from "@/components/ui/calendar"

const meta = {
  title: "UI/Calendar",
  component: Calendar,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Calendar>

export default meta

type Story = StoryObj<typeof meta>

export const Single: Story = {
  args: {
    mode: "single",
    selected: new Date("2026-06-10T12:00:00.000Z"),
    defaultMonth: new Date("2026-06-01T12:00:00.000Z"),
  },
}

export const DropdownCaption: Story = {
  args: {
    mode: "single",
    captionLayout: "dropdown",
    selected: new Date("2026-06-10T12:00:00.000Z"),
    defaultMonth: new Date("2026-06-01T12:00:00.000Z"),
  },
}

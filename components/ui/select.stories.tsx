import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const meta = {
  title: "UI/Select",
  component: Select,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Select>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Select defaultValue="until-acknowledged">
      <SelectTrigger className="w-72" aria-label="When a countdown reaches zero">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="until-acknowledged">Until I acknowledge it</SelectItem>
        <SelectItem value="after-15-minutes">After 15 minutes</SelectItem>
        <SelectItem value="immediately">Immediately</SelectItem>
      </SelectContent>
    </Select>
  ),
}

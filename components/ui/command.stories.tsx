import { ArchiveIcon, ClockIcon, SearchIcon, SettingsIcon } from "lucide-react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

const meta = {
  title: "UI/Command",
  component: Command,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Command>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Command className="w-[360px] rounded-lg border">
      <CommandInput placeholder="Search actions..." />
      <CommandList>
        <CommandEmpty>No actions found.</CommandEmpty>
        <CommandGroup heading="Timers">
          <CommandItem>
            <ClockIcon />
            New timer
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <ArchiveIcon />
            Archive selected
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Project">
          <CommandItem>
            <SettingsIcon />
            Settings
          </CommandItem>
          <CommandItem>
            <SearchIcon />
            Search spaces
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

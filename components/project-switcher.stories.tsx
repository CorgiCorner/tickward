import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"

import { ProjectSwitcher } from "@/components/project-switcher"
import { TimerStorePreview } from "@/components/storybook/timer-store-preview"
import { setActiveLocale } from "@/lib/i18n/active-locale"
import type { ProjectMeta } from "@/lib/project-model"

const meta = {
  title: "App/ProjectSwitcher",
  component: ProjectSwitcher,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <TimerStorePreview>
        <Story />
      </TimerStorePreview>
    ),
  ],
} satisfies Meta<typeof ProjectSwitcher>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NarrowContainer: Story = {
  render: () => (
    <div className="w-44">
      <ProjectSwitcher />
    </div>
  ),
}

function makeStoryAccountMeta(index: number): ProjectMeta {
  const joinedAt = new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 86_400_000).toISOString()
  return {
    id: `project-story-${index}`,
    name: `Projekt ${index + 1}`,
    restoreKey: `restoreKey_story_${index}`,
    cloudProjectId: `project_story_${index}`,
    ownerId: "user_story",
    claimedAt: joinedAt,
    createdAt: joinedAt,
    updatedAt: joinedAt,
    timerCount: 1,
    spaceCount: 0,
  }
}

// Over-limit account: the newest projects get the read-only badge. The play
// function guards against the badge forcing horizontal overflow in the list
// (the longest translation is the Polish one, hence the locale switch).
export const OverLimitReadOnly: Story = {
  loaders: [
    async () => {
      setActiveLocale("pl")
      const metas = Array.from({ length: 12 }, (_, index) => makeStoryAccountMeta(index))
      localStorage.setItem("td_projects_v1", JSON.stringify(metas))
      localStorage.setItem("td_active_project_v1", "project-story-11")
      return {}
    },
  ],
  play: async ({ canvasElement }) => {
    try {
      const trigger = within(canvasElement).getByRole("button")
      await userEvent.click(trigger)

      const body = within(document.body)
      await waitFor(() => expect(body.getAllByText(/tylko odczyt/i).length).toBeGreaterThan(0))

      // 1px tolerance absorbs sub-pixel rounding in headless layout; anything
      // beyond that is real horizontal overflow.
      const list = document.querySelector<HTMLElement>(".max-h-56")
      if (!list) throw new Error("project list container not found")
      expect(list.scrollWidth, "project list must not overflow horizontally").toBeLessThanOrEqual(list.clientWidth + 1)

      const content = list.parentElement
      if (content) {
        expect(content.scrollWidth, "popover content must not overflow horizontally").toBeLessThanOrEqual(
          content.clientWidth + 1,
        )
      }
    } finally {
      setActiveLocale("en")
      localStorage.removeItem("td_projects_v1")
      localStorage.removeItem("td_active_project_v1")
    }
  },
}

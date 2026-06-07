import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import {
  AppShellLoading,
  AuthMainLoadingSkeleton,
  AuthPageLoading,
  HomeMainLoadingSkeleton,
  HomePageLoading,
  SettingsMainLoadingSkeleton,
  SettingsPageLoading,
  SharedTimerMainLoadingSkeleton,
  SharedTimerPageLoading,
} from "@/components/app-shell-loading"

const meta = {
  title: "App/AppShellLoading",
  component: AppShellLoading,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof AppShellLoading>

export default meta

type Story = StoryObj<typeof meta>

export const FullPage: Story = {}

export const HomePage: Story = {
  render: () => <HomePageLoading />,
}

export const SettingsPage: Story = {
  render: () => <SettingsPageLoading />,
}

export const AuthPage: Story = {
  render: () => <AuthPageLoading />,
}

export const SharedTimerPage: Story = {
  render: () => <SharedTimerPageLoading />,
}

export const MainOnly: Story = {
  render: () => (
    <main className="mx-auto w-full max-w-[640px] px-4 py-6">
      <HomeMainLoadingSkeleton />
    </main>
  ),
}

export const SettingsMainOnly: Story = {
  render: () => (
    <main className="mx-auto w-full max-w-[640px] px-4 py-6">
      <SettingsMainLoadingSkeleton />
    </main>
  ),
}

export const AuthMainOnly: Story = {
  render: () => (
    <main className="mx-auto w-full max-w-[440px] px-4 py-8">
      <AuthMainLoadingSkeleton />
    </main>
  ),
}

export const SharedTimerMainOnly: Story = {
  render: () => (
    <main className="mx-auto w-full max-w-[640px] px-4 py-6">
      <SharedTimerMainLoadingSkeleton />
    </main>
  ),
}

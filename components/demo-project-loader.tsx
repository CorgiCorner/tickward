"use client"

import { ArrowRightIcon, CheckIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createDemoProject, DEMO_PROJECT_ID } from "@/lib/demo-project"
import { formatMessage } from "@/lib/i18n/messages"
import { setLocalFullPageAlarmEnabled, setLocalNotificationSound } from "@/lib/local-notification-preferences.client"
import { MAX_PROJECTS } from "@/lib/project-model"
import {
  readProjectRegistry,
  writeActiveProjectId,
  writeProjectPayload,
  writeProjectRegistry,
} from "@/lib/project-storage.client"

function loadDemoProject() {
  const demo = createDemoProject()
  const existingProjects = readProjectRegistry().filter((project) => project.id !== DEMO_PROJECT_ID)

  writeProjectRegistry([demo.project, ...existingProjects].slice(0, MAX_PROJECTS))
  writeActiveProjectId(demo.project.id)
  writeProjectPayload(demo.project.id, demo.payload)
  setLocalFullPageAlarmEnabled(true)
  setLocalNotificationSound("glass")
}

export function DemoProjectLoader() {
  const [loaded, setLoaded] = useState(false)

  function handleLoadDemoProject() {
    loadDemoProject()
    setLoaded(true)
    toast.success(formatMessage("demo.loaded"))
  }

  function openProject() {
    globalThis.location.assign("/")
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[640px] place-items-center px-4 py-10">
      <div className="grid gap-5 rounded-2xl border bg-card p-6">
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SparklesIcon className="size-4" />
            {formatMessage("demo.eyebrow")}
          </div>
          <h1 className="text-2xl font-semibold tracking-normal">{formatMessage("demo.title")}</h1>
          <p className="text-sm text-muted-foreground">{formatMessage("demo.description")}</p>
        </div>

        <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          {formatMessage("demo.note")}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={handleLoadDemoProject}>
            {loaded ? <CheckIcon className="size-4" /> : <SparklesIcon className="size-4" />}
            {formatMessage(loaded ? "demo.loadedAction" : "demo.load")}
          </Button>
          <Button variant="outline" disabled={!loaded} onClick={openProject}>
            <ArrowRightIcon className="size-4" />
            {formatMessage("demo.openProject")}
          </Button>
        </div>
      </div>
    </main>
  )
}

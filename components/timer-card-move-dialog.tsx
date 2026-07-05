"use client"

import { FolderIcon } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatMessage } from "@/lib/i18n/messages"

export function MoveToProjectDialog(
  props: Readonly<{
    open: boolean
    onOpenChange: (open: boolean) => void
    projects: { id: string; name: string }[]
    onMove: (projectId: string) => void
  }>,
) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{formatMessage("timer.move.title")}</DialogTitle>
          <DialogDescription>{formatMessage("timer.move.description")}</DialogDescription>
        </DialogHeader>
        {props.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">{formatMessage("timer.move.empty")}</p>
        ) : (
          <div className="grid gap-1">
            {props.projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                onClick={() => props.onMove(project.id)}
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{project.name}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

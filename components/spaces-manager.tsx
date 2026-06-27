"use client"

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import type { Space } from "@/lib/types"

const SPACE_COLORS = [undefined, "#2563eb", "#16a34a", "#f97316", "#db2777", "#7c3aed"] as const

export function ColorSwatches(props: Readonly<{ value?: string; onChange: (color?: string) => void }>) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {SPACE_COLORS.map((color) => {
        const active = props.value === color || (!props.value && !color)
        return (
          <button
            key={color ?? "none"}
            type="button"
            aria-label={color ? formatMessage("organizer.color.use", { color }) : formatMessage("organizer.color.none")}
            aria-pressed={active}
            className={[
              "size-6 rounded-full border transition",
              active ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:scale-105",
              color ? "" : "bg-background",
            ].join(" ")}
            style={color ? { backgroundColor: color } : undefined}
            onClick={() => props.onChange(color)}
          >
            {color === undefined ? <span className="mx-auto block h-px w-3 rotate-45 bg-muted-foreground" /> : null}
          </button>
        )
      })}
    </div>
  )
}

function SortableSpaceRow(
  props: Readonly<{
    space: Space
    onRename: (space: Space, name: string) => void
    onRecolor: (space: Space, color?: string) => void
    onDelete: (space: Space) => void
  }>,
) {
  const { space } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: space.id })
  const [name, setName] = useState(space.name)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  function commitName() {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(space.name)
      return
    }
    if (trimmed !== space.name) props.onRename(space, trimmed)
  }

  return (
    <div ref={setNodeRef} style={style} className="grid gap-2 rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="-ml-1 shrink-0 cursor-grab touch-none p-1 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          aria-label={formatMessage("space.reorder", { name: space.name })}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <Input
          value={name}
          maxLength={30}
          aria-label={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={formatMessage("space.delete", { name: space.name })}
          onClick={() => props.onDelete(space)}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      <ColorSwatches value={space.color} onChange={(color) => props.onRecolor(space, color)} />
    </div>
  )
}

// Rename / recolor / reorder / delete existing spaces. Adding a space lives in the
// organizer bar; this management surface is embedded in project settings.
export function SpacesManager() {
  const spaces = useTimerStore((s) => s.spaces) ?? []
  const updateSpace = useTimerStore((s) => s.updateSpace)
  const deleteSpace = useTimerStore((s) => s.deleteSpace)
  const reorderSpaces = useTimerStore((s) => s.reorderSpaces)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  if (spaces.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        {formatMessage("space.empty")}
      </p>
    )
  }

  function handleRename(space: Space, name: string) {
    updateSpace(space.id, { name })
    toast.success(formatMessage("space.updated"))
  }

  function handleRecolor(space: Space, color?: string) {
    if (color === space.color) return
    updateSpace(space.id, { color })
  }

  function handleDelete(space: Space) {
    deleteSpace(space.id)
    toast.success(formatMessage("space.deleted"))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = spaces.findIndex((space) => space.id === active.id)
    const toIndex = spaces.findIndex((space) => space.id === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    reorderSpaces(fromIndex, toIndex)
  }

  return (
    <div className="grid gap-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={spaces.map((space) => space.id)} strategy={verticalListSortingStrategy}>
          {spaces.map((space) => (
            <SortableSpaceRow
              key={space.id}
              space={space}
              onRename={handleRename}
              onRecolor={handleRecolor}
              onDelete={handleDelete}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

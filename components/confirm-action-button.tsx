"use client"

import type { ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { formatMessage } from "@/lib/i18n/messages"

type ConfirmActionButtonProps = Readonly<{
  actionLabel: string
  cancelLabel?: string
  children: ReactNode
  confirmAction: () => void
  description: string
  disabled?: boolean
  icon?: ReactNode
  loading?: boolean
  title: string
}>

export function ConfirmActionButton(props: ConfirmActionButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" loading={props.loading} disabled={props.disabled}>
          {!props.loading ? props.icon : null}
          {props.children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{props.cancelLabel ?? formatMessage("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={props.confirmAction}>
            {props.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updatePlanEntitlements, type PlanEntitlementValues } from "@/app/[locale]/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PLAN_IDS,
  planEntitlementConsistencyError,
  type Entitlements,
  type EntitlementsTable,
  type PlanId,
} from "@/lib/entitlements"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"

const LIMIT_FIELDS: Array<{ key: keyof PlanEntitlementValues; label: MessageKey }> = [
  { key: "maxProjects", label: "admin.entitlements.maxProjects" },
  { key: "maxTimers", label: "admin.entitlements.maxTimers" },
  { key: "maxTimersPerSpace", label: "admin.entitlements.maxTimersPerSpace" },
  { key: "maxSpaces", label: "admin.entitlements.maxSpaces" },
  { key: "maxSnapshotTimers", label: "admin.entitlements.maxSnapshotTimers" },
]

function valuesFromEntitlements(entitlements: Entitlements): PlanEntitlementValues {
  return {
    maxProjects: entitlements.maxProjects,
    maxTimers: entitlements.maxTimers,
    maxTimersPerSpace: entitlements.maxTimersPerSpace,
    maxSpaces: entitlements.maxSpaces,
    maxSnapshotTimers: entitlements.maxSnapshotTimers,
  }
}

function planLabel(plan: PlanId) {
  return formatMessage(plan === "anonymous" ? "admin.entitlements.plan.anonymous" : "admin.entitlements.plan.free")
}

function planFormKey(entitlements: Entitlements) {
  return [
    entitlements.plan,
    entitlements.maxProjects,
    entitlements.maxTimers,
    entitlements.maxTimersPerSpace,
    entitlements.maxSpaces,
    entitlements.maxSnapshotTimers,
  ].join(":")
}

function PlanForm(props: Readonly<{ defaults: Entitlements; entitlements: Entitlements; plan: PlanId }>) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(() => valuesFromEntitlements(props.entitlements))

  return (
    <form
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        const consistencyError = planEntitlementConsistencyError(values)
        if (consistencyError) {
          toast.error(formatMessage(consistencyError))
          return
        }
        startTransition(async () => {
          try {
            await updatePlanEntitlements(props.plan, values)
            toast.success(formatMessage("admin.entitlements.saved"))
            router.refresh()
          } catch {
            toast.error(formatMessage("admin.entitlements.saveFailed"))
          }
        })
      }}
    >
      <div className="grid gap-1">
        <h3 className="font-semibold">{planLabel(props.plan)}</h3>
        <p className="text-xs text-muted-foreground">{formatMessage("admin.entitlements.effectiveDescription")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {LIMIT_FIELDS.map((field) => {
          const id = `${props.plan}-${field.key}`
          return (
            <div key={field.key} className="grid gap-1.5">
              <Label htmlFor={id}>{formatMessage(field.label)}</Label>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                step={1}
                required
                disabled={pending}
                value={values[field.key]}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setValues((current) => ({ ...current, [field.key]: value }))
                }}
              />
              <p className="text-xs text-muted-foreground/75">
                {formatMessage("admin.entitlements.defaultValue", { value: props.defaults[field.key] })}
              </p>
            </div>
          )
        })}
      </div>
      <Button type="submit" className="w-fit" loading={pending}>
        {formatMessage("admin.entitlements.save")}
      </Button>
    </form>
  )
}

export function PlanEntitlementsEditor(
  props: Readonly<{ defaults: EntitlementsTable; entitlements: EntitlementsTable }>,
) {
  return (
    <div className="grid gap-4">
      {PLAN_IDS.map((plan) => (
        <PlanForm
          key={planFormKey(props.entitlements[plan])}
          plan={plan}
          defaults={props.defaults[plan]}
          entitlements={props.entitlements[plan]}
        />
      ))}
    </div>
  )
}

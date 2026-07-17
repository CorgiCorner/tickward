import type { MessageKey } from "@/lib/i18n/messages"
import type { MilestoneRule } from "@/lib/milestones"
import { compileSinceTimerRecipe } from "@/lib/schemas/timer"

export type MilestonePresetId =
  | "anniversaries"
  | "monthiversaries"
  | "every-100-days"
  | "weekly-streak"
  | "recovery-ladder"

export const MILESTONE_PRESETS: Array<{
  id: MilestonePresetId
  labelKey: MessageKey
  rules: MilestoneRule[]
}> = [
  {
    id: "anniversaries",
    labelKey: "timer.form.milestones.anniversaries",
    rules: compileSinceTimerRecipe("anniversary").milestones.rules,
  },
  {
    id: "monthiversaries",
    labelKey: "timer.form.milestones.monthiversaries",
    rules: compileSinceTimerRecipe("monthiversary").milestones.rules,
  },
  {
    id: "every-100-days",
    labelKey: "timer.form.milestones.every100Days",
    rules: [{ unit: "days", every: 100 }],
  },
  {
    id: "weekly-streak",
    labelKey: "timer.form.milestones.weeklyStreak",
    rules: compileSinceTimerRecipe("streak").milestones.rules,
  },
  {
    id: "recovery-ladder",
    labelKey: "timer.form.milestones.recoveryLadder",
    rules: compileSinceTimerRecipe("recovery-ladder").milestones.rules,
  },
]

export function milestonePresetRules(id: MilestonePresetId): MilestoneRule[] {
  const rules = MILESTONE_PRESETS.find((preset) => preset.id === id)?.rules ?? MILESTONE_PRESETS[0]!.rules
  return rules.map((rule) => ("every" in rule ? { ...rule } : { ...rule, at: [...rule.at] }))
}

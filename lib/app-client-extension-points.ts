import type { ReactNode } from "react"

import type { ClaimProjectResult } from "@/lib/project-client"

export type ProjectClaimActionProps = {
  restoreKey: string
  projectName: string
  claimProject: () => Promise<ClaimProjectResult>
}

export type AppClientExtensions = {
  renderProjectClaimAction?: (props: ProjectClaimActionProps) => ReactNode
}

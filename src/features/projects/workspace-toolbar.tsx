import type { ReactElement } from "react"

import type { ProjectSession } from "@/domain/project"

/** Keeps project-level actions separate from the active document surface. */
export function WorkspaceToolbar({
  session,
}: {
  session: ProjectSession
}): ReactElement {
  return (
    <header className="flex min-w-0 items-center gap-2 border-b bg-workspace-chrome px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="shrink-0 truncate text-sm font-semibold">
          {session.project.name}
        </p>
        {session.workspace.selectedFile !== null ? (
          <>
            <span aria-hidden="true" className="text-muted-foreground/60">
              /
            </span>
            <p className="truncate text-xs text-muted-foreground">
              {session.workspace.selectedFile}
            </p>
          </>
        ) : null}
      </div>
    </header>
  )
}

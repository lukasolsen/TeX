import { FileCode2, FileX2, Folder, Trash2 } from "lucide-react"
import type { ReactElement } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { RecentProject } from "@/domain/project"
import type { CanonicalProjectPath } from "@/domain/identifiers"
import { formatLastOpened } from "@/features/projects/project-model"

export function RecentProjectList({
  projects,
  onForget,
  onOpen,
}: {
  projects: ReadonlyArray<RecentProject>
  onForget: (path: CanonicalProjectPath) => void
  onOpen: (path: CanonicalProjectPath) => void
}): ReactElement {
  if (projects.length === 0) {
    return (
      <Empty className="min-h-48 rounded-xl border bg-card p-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Folder aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No recent projects</EmptyTitle>
          <EmptyDescription>
            Open a project folder above and it will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul
      aria-label="Recent projects"
      className="flex flex-col rounded-xl border bg-card p-1.5"
    >
      {projects.map((project) => {
        const available = project.availability === "available"
        return (
          <li
            className="group flex min-w-0 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-100 focus-within:bg-accent hover:bg-accent"
            key={project.path}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-home-document text-primary shadow-raised">
              {available ? (
                <FileCode2 aria-hidden="true" />
              ) : (
                <FileX2 aria-hidden="true" />
              )}
            </span>
            <button
              className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!available}
              onClick={() => onOpen(project.path)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {project.name}
                </span>
                {available ? null : (
                  <Badge variant="outline">Unavailable</Badge>
                )}
              </span>
              <span className="mt-0.5 block truncate font-mono text-meta text-muted-foreground">
                {project.path}
              </span>
            </button>
            <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block">
              {formatLastOpened(project.lastOpenedAt)}
            </span>
            {/* Revealed on hover and whenever the row holds focus, so the
                keyboard path is never worse than the pointer path. */}
            <Button
              aria-label={`Forget ${project.name}`}
              className="opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
              onClick={() => onForget(project.path)}
              size="icon-sm"
              title={`Forget ${project.name} (does not delete files)`}
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

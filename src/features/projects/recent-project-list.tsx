import { Clock3, FileCode2, FileX2, Folder, Trash2 } from "lucide-react"

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
import { formatLastOpened } from "@/features/projects/project-model"

export function RecentProjectList({
  projects,
  onForget,
  onOpen,
}: {
  projects: RecentProject[]
  onForget: (path: string) => void
  onOpen: (path: string) => void
}) {
  if (projects.length === 0) {
    return (
      <Empty className="min-h-56 border bg-card p-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Folder aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No recent projects</EmptyTitle>
          <EmptyDescription>
            Open a project folder and it will appear here for quick local
            access.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid h-9 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3 border-b bg-muted/40 px-4 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_10rem_2.5rem]">
        <span>Name</span>
        <span className="hidden sm:block">Last opened</span>
        <span className="sr-only">Actions</span>
      </div>
      <ul>
        {projects.map((project) => {
          const available = project.availability === "available"
          return (
            <li
              className="group grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3 border-b px-4 py-2.5 last:border-b-0 focus-within:bg-muted/50 hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_10rem_2.5rem]"
              key={project.path}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-home-document text-primary shadow-xs">
                  {available ? (
                    <FileCode2 aria-hidden="true" />
                  ) : (
                    <FileX2 aria-hidden="true" />
                  )}
                </span>
                <button
                  className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!available}
                  onClick={() => onOpen(project.path)}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {project.name}
                    </span>
                    {!available ? (
                      <Badge variant="outline">Unavailable</Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {project.path}
                  </span>
                </button>
              </div>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <Clock3 aria-hidden="true" className="size-3.5" />
                {formatLastOpened(project.lastOpenedAt)}
              </span>
              <Button
                aria-label={`Forget ${project.name}`}
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
    </div>
  )
}

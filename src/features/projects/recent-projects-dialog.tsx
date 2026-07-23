import { CircleAlert, FileCode2, FileX2, FolderOpen } from "lucide-react"
import type { ReactElement } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import type { CanonicalProjectPath } from "@/domain/identifiers"
import { formatLastOpened } from "@/features/projects/project-model"
import { useRecentProjects } from "@/features/projects/use-recent-projects"

/**
 * The keyboard route back into a project this device already remembers. It
 * reads the history when it opens rather than trusting a copy held by the
 * surface underneath, so an entry whose folder disappeared is shown as
 * unavailable instead of offered as an action that cannot succeed.
 */
export function RecentProjectsDialog({
  onOpenChange,
  onOpenProject,
  onOpenRecent,
  open,
}: {
  onOpenChange: (open: boolean) => void
  onOpenProject: () => void
  onOpenRecent: (path: CanonicalProjectPath) => void
  open: boolean
}): ReactElement {
  const recent = useRecentProjects(open)
  const run = (command: () => void) => {
    onOpenChange(false)
    command()
  }

  return (
    <CommandDialog
      description="Reopen a project this device remembers."
      onOpenChange={onOpenChange}
      open={open}
      title="Recent projects"
    >
      <CommandInput placeholder="Search recent projects…" />
      <CommandList>
        <CommandEmpty>No recent project matches that search.</CommandEmpty>
        {recent.status === "loading" ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Reading recent projects…
          </p>
        ) : null}
        {recent.status === "error" ? (
          <p
            className="flex items-center gap-2 px-4 py-6 text-sm text-destructive"
            role="alert"
          >
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            Couldn&apos;t read recent projects: {recent.error.message}
          </p>
        ) : null}
        {recent.status === "ready" && recent.projects.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No projects opened on this device yet.
          </p>
        ) : null}
        {recent.status === "ready" && recent.projects.length > 0 ? (
          <>
            <CommandGroup heading="Recent projects">
              {recent.projects.map((project) => {
                const available = project.availability === "available"
                return (
                  <CommandItem
                    disabled={!available}
                    key={project.path}
                    onSelect={() => run(() => onOpenRecent(project.path))}
                    value={`${project.name} ${project.path}`}
                  >
                    {available ? (
                      <FileCode2 aria-hidden="true" />
                    ) : (
                      <FileX2 aria-hidden="true" />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">
                        {project.name}
                        {available ? null : " — unavailable"}
                      </span>
                      <span className="truncate font-mono text-meta text-muted-foreground">
                        {project.path}
                      </span>
                    </span>
                    <CommandShortcut className="whitespace-nowrap">
                      {formatLastOpened(project.lastOpenedAt)}
                    </CommandShortcut>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandSeparator className="mx-2" />
          </>
        ) : null}
        <CommandGroup heading="Other">
          <CommandItem
            onSelect={() => run(onOpenProject)}
            value="open project folder"
          >
            <FolderOpen aria-hidden="true" /> Open project folder…
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

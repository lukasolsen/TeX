import { FileCheck2, Info } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ProjectSummary } from "@/domain/project"
import type { ProjectRelativePath } from "@/domain/identifiers"
import { rootEvidenceLabel } from "@/features/projects/project-model"

export function RootFileControl({
  onSelectRoot,
  project,
  selectedRoot,
}: {
  onSelectRoot: (path: ProjectRelativePath) => void
  project: ProjectSummary
  selectedRoot: ProjectRelativePath | null
}) {
  const selectedCandidate = project.rootCandidates.find(
    (candidate) => candidate.path === selectedRoot
  )
  if (selectedRoot !== null && selectedCandidate === undefined) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-status-foreground">
        <FileCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">Root: {selectedRoot}</span>
      </span>
    )
  }

  if (project.rootCandidates.length === 0) {
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-status-foreground"
        title="No unambiguous document entry point was found"
      >
        <Info aria-hidden="true" className="size-3.5" />
        No root detected
      </span>
    )
  }

  if (project.rootCandidates.length === 1 && selectedRoot !== null) {
    const candidate = project.rootCandidates[0]
    if (candidate === undefined) return null
    return (
      <span
        className="flex min-w-0 items-center gap-1.5 text-xs text-status-foreground"
        title={`Detected from ${rootEvidenceLabel(candidate.evidence)}`}
      >
        <FileCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">Root: {candidate.path}</span>
      </span>
    )
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-status-foreground">
      <FileCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="shrink-0">Root:</span>
      <Select
        onValueChange={(path) => {
          if (path !== null) onSelectRoot(path)
        }}
        value={selectedRoot ?? undefined}
      >
        <SelectTrigger
          aria-label="Root file"
          className="h-6 max-w-56 min-w-0 rounded-md px-2 text-xs"
          size="sm"
        >
          <SelectValue placeholder="Choose root file" />
        </SelectTrigger>
        <SelectContent side="top">
          <SelectGroup>
            {project.rootCandidates.map((candidate) => (
              <SelectItem key={candidate.path} value={candidate.path}>
                {candidate.path}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </span>
  )
}

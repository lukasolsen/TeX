import { Check, FileCheck2, Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ProjectSummary } from "@/domain/project"
import { rootEvidenceLabel } from "@/features/projects/project-model"

export function RootFileControl({
  onSelectRoot,
  project,
  selectedRoot,
}: {
  onSelectRoot: (path: string) => void
  project: ProjectSummary
  selectedRoot: string | null
}) {
  const selectedCandidate = project.rootCandidates.find(
    (candidate) => candidate.path === selectedRoot
  )
  if (selectedRoot !== null && selectedCandidate === undefined) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <FileCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
        <span>Root</span>
        <span className="max-w-56 truncate font-medium text-foreground">
          {selectedRoot}
        </span>
        <span className="hidden xl:inline">Saved selection</span>
      </div>
    )
  }

  if (project.rootCandidates.length === 0) {
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
        title="No unambiguous document entry point was found"
      >
        <Info aria-hidden="true" className="size-3.5" />
        No root detected
      </span>
    )
  }

  if (project.rootCandidates.length === 1 && selectedRoot !== null) {
    const candidate = project.rootCandidates[0]
    return (
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <FileCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
        <span>Root</span>
        <span className="max-w-56 truncate font-medium text-foreground">
          {candidate.path}
        </span>
        <span className="hidden truncate xl:inline">
          Detected from {rootEvidenceLabel(candidate.evidence)}
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex min-w-0 items-center gap-2"
      role="group"
      aria-label="Choose root file"
    >
      <span className="shrink-0 text-xs font-medium">Root file</span>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {project.rootCandidates.map((candidate) => (
          <Button
            aria-pressed={selectedRoot === candidate.path}
            key={candidate.path}
            onClick={() => onSelectRoot(candidate.path)}
            size="xs"
            title={`Detected from ${rootEvidenceLabel(candidate.evidence)}`}
            variant={selectedRoot === candidate.path ? "secondary" : "ghost"}
          >
            {selectedRoot === candidate.path ? (
              <Check data-icon="inline-start" />
            ) : null}
            {candidate.path}
          </Button>
        ))}
      </div>
    </div>
  )
}

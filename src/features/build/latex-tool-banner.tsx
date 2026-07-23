import { AlertCircle, Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { BuildEngine, BuildProfile } from "@/domain/build"
import { installStepSummary } from "@/domain/latex-install"
import type { LatexInstallController } from "@/features/build/use-latex-install"

/**
 * States the missing build tool where the Build tab already looks, and offers
 * the one action that resolves it. While an installation runs the same row
 * reports its real step, so closing the dialog never hides live work.
 */
export function LatexToolBanner({
  alternative,
  install,
  onOpenInstaller,
  onUseAlternative,
  profile,
}: {
  alternative: BuildProfile | null
  install: LatexInstallController
  onOpenInstaller: () => void
  onUseAlternative: (engine: BuildEngine) => void
  profile: BuildProfile | null
}) {
  const { progress, running } = install
  const activeStep =
    progress === null
      ? null
      : (progress.steps[progress.activeStep ?? 0] ?? null)
  const missing = profile?.executable ?? "the build tool"
  // An alternative that cannot resolve references is still worth offering, but
  // presenting it as an equivalent would promise a document it cannot produce.
  const detail =
    running && progress !== null
      ? `${installStepSummary(progress)} · ${activeStep?.detail ?? activeStep?.title ?? "Working"}`
      : alternative === null
        ? `TeX could not find ${missing} on this computer. Install it to build this project.`
        : alternative.resolvesReferences
          ? `TeX could not find ${missing}, but ${alternative.label} is installed and can build this project.`
          : `TeX could not find ${missing}. ${alternative.label} is installed, but it leaves cross-references, the table of contents, and citations unresolved.`

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-3 border-b bg-card px-3 py-2">
      {running ? (
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
        />
      ) : (
        <AlertCircle
          aria-hidden="true"
          className="size-4 shrink-0 text-destructive"
        />
      )}
      <p className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-medium">
          {running
            ? "Installing LaTeX"
            : `${profile?.label ?? "The selected build tool"} is not installed`}
        </span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </p>
      {running || alternative === null ? null : (
        <Button
          className="shrink-0"
          onClick={() => onUseAlternative(alternative.engine)}
          size="sm"
          variant="outline"
        >
          Use {alternative.label}
        </Button>
      )}
      <Button
        className="shrink-0"
        onClick={onOpenInstaller}
        size="sm"
        variant={running ? "outline" : "default"}
      >
        {running ? null : (
          <Download aria-hidden="true" data-icon="inline-start" />
        )}
        {running ? "Installation details" : "Install LaTeX…"}
      </Button>
    </div>
  )
}

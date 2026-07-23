import { FolderOpen, Info, Settings } from "lucide-react"
import type { ReactElement } from "react"

import { AppBrand } from "@/components/brand/app-brand"
import { OpenProjectFeedbackView } from "@/components/feedback/open-project-feedback"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { OpenProjectFeedback, StartupState } from "@/domain/project"
import type { CanonicalProjectPath } from "@/domain/identifiers"
import { RecentProjectList } from "@/features/projects/recent-project-list"

/**
 * The starting surface: one primary action, the projects this device actually
 * remembers, and nothing else. `ui-ux-requirements.md` forbids turning an empty
 * state into a dashboard, so there is no navigation rail standing in for
 * destinations that do not exist and no repeated reassurance — the privacy
 * statement is made once, at the end, where it also explains Forget.
 */
export function ProjectHomePage({
  feedback,
  onClearFeedback,
  onForgetProject,
  onOpenProject,
  onOpenRecent,
  onOpenSettings,
  startup,
}: {
  feedback: OpenProjectFeedback
  onClearFeedback: () => void
  onForgetProject: (path: CanonicalProjectPath) => void
  onOpenProject: () => void
  onOpenRecent: (path: CanonicalProjectPath) => void
  onOpenSettings: () => void
  startup: StartupState
}): ReactElement {
  const isOpening =
    feedback.status === "choosing" || feedback.status === "opening"

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-home-surface">
      <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:px-8 md:py-16">
        <div className="flex items-center gap-3">
          <AppBrand />
          <Button
            aria-label="Open settings"
            className="ml-auto"
            onClick={onOpenSettings}
            size="icon-sm"
            title="Open settings"
            variant="ghost"
          >
            <Settings aria-hidden="true" />
          </Button>
        </div>

        <header className="mt-10">
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Open a LaTeX project
          </h1>
          <p className="mt-3 max-w-xl text-sm/6 text-muted-foreground">
            TeX edits a project folder that already exists on this computer.
            Source, PDF, reading position, and layout come back exactly as you
            left them.
          </p>
        </header>

        <div className="mt-8">
          <Button
            disabled={isOpening}
            onClick={onOpenProject}
            size="lg"
            title="Open an existing project folder on this computer"
          >
            <FolderOpen data-icon="inline-start" />
            Open project folder
          </Button>
          {/* Reserved so acknowledging the click never shifts the list below. */}
          <div className="mt-3 min-h-9">
            <OpenProjectFeedbackView
              feedback={feedback}
              onClear={onClearFeedback}
            />
          </div>
        </div>

        <Separator className="my-10" />

        <section aria-labelledby="recent-heading">
          <h2
            className="font-heading text-base font-semibold"
            id="recent-heading"
          >
            Recent projects
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Continue from a workspace this device remembers.
          </p>

          {startup.restorationNotice !== null ? (
            <Alert className="mt-4">
              <Info aria-hidden="true" />
              <AlertDescription>{startup.restorationNotice}</AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-4">
            <RecentProjectList
              onForget={onForgetProject}
              onOpen={onOpenRecent}
              projects={startup.recentProjects}
            />
          </div>

          <p className="mt-6 text-xs/5 text-muted-foreground">
            Projects stay on this device; TeX does not upload document contents.
            Forget removes only TeX&apos;s local history — project files are
            never deleted.
          </p>
        </section>
      </div>
    </main>
  )
}

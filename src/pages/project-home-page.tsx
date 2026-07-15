import { FolderOpen, Home, Info, LockKeyhole, ShieldCheck } from "lucide-react"

import { AppBrand } from "@/components/brand/app-brand"
import { OpenProjectFeedbackView } from "@/components/feedback/open-project-feedback"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { OpenProjectFeedback, StartupState } from "@/domain/project"
import { RecentProjectList } from "@/features/projects/recent-project-list"

export function ProjectHomePage({
  feedback,
  onClearFeedback,
  onForgetProject,
  onOpenProject,
  onOpenRecent,
  startup,
}: {
  feedback: OpenProjectFeedback
  onClearFeedback: () => void
  onForgetProject: (path: string) => void
  onOpenProject: () => void
  onOpenRecent: (path: string) => void
  startup: StartupState
}) {
  const isOpening =
    feedback.status === "choosing" || feedback.status === "opening"

  return (
    <main className="grid min-h-svh bg-home-surface md:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside className="hidden min-h-svh flex-col border-r bg-home-nav text-home-nav-foreground md:flex">
        <div className="flex h-20 items-center px-6">
          <AppBrand />
        </div>
        <nav
          aria-label="Project home"
          className="flex flex-col gap-1 px-3 py-3"
        >
          <div
            aria-current="page"
            className="flex h-9 items-center gap-2 rounded-lg bg-home-nav-active px-3 text-sm font-medium text-foreground"
          >
            <Home aria-hidden="true" className="size-3.5" />
            Home
          </div>
          <Button
            className="w-full justify-start"
            disabled={isOpening}
            onClick={onOpenProject}
            variant="ghost"
          >
            <FolderOpen data-icon="inline-start" />
            Open project
          </Button>
        </nav>
        <div className="mt-auto px-5 py-5">
          <Separator className="mb-5" />
          <div className="flex items-start gap-2.5 text-xs/5 text-muted-foreground">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            <p>
              Projects stay on this device. TeX does not upload document
              contents.
            </p>
          </div>
        </div>
      </aside>

      <div className="min-h-svh min-w-0 overflow-y-auto bg-background">
        <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-12 lg:px-14">
          <header className="flex items-start gap-4">
            <div className="pt-0.5 md:hidden">
              <AppBrand compact />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em]">
                Your projects
              </h1>
              <p className="mt-2 max-w-2xl text-sm/6 text-muted-foreground">
                Open a local LaTeX project or continue from a remembered
                workspace.
              </p>
            </div>
          </header>

          <section aria-labelledby="start-heading" className="mt-10">
            <div className="mb-4">
              <h2
                className="font-heading text-base font-semibold"
                id="start-heading"
              >
                Open a project
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select an existing folder from this computer.
              </p>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,32rem)_minmax(18rem,1fr)]">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Open a local project folder</CardTitle>
                  <CardDescription>
                    TeX will inspect its structure, find possible root files,
                    and leave the source tree unchanged.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LockKeyhole
                      aria-hidden="true"
                      className="size-3.5 shrink-0"
                    />
                    Access begins only after you choose a folder.
                  </div>
                </CardContent>
                <CardFooter>
                  <Button disabled={isOpening} onClick={onOpenProject}>
                    <FolderOpen data-icon="inline-start" />
                    Choose folder
                  </Button>
                </CardFooter>
              </Card>

              <div className="min-h-12 pt-1">
                <OpenProjectFeedbackView
                  feedback={feedback}
                  onClear={onClearFeedback}
                />
              </div>
            </div>
          </section>

          <Separator className="my-10" />

          <section aria-labelledby="recent-heading">
            <div className="mb-5">
              <div>
                <h2
                  className="font-heading text-base font-semibold"
                  id="recent-heading"
                >
                  Recent projects
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Continue from locally remembered project workspaces.
                </p>
              </div>
            </div>

            {startup.restorationNotice !== null ? (
              <Alert className="mb-4">
                <Info aria-hidden="true" />
                <AlertDescription>{startup.restorationNotice}</AlertDescription>
              </Alert>
            ) : null}

            <RecentProjectList
              onForget={onForgetProject}
              onOpen={onOpenRecent}
              projects={startup.recentProjects}
            />
            <p className="mt-4 text-xs/5 text-muted-foreground">
              Forget removes only TeX&apos;s local history. Project files are
              never deleted.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}

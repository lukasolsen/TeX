import { CircleAlert, FileCode2, LoaderCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import type { AsyncDocumentState } from "@/domain/project"

export function SourceViewer({ state }: { state: AsyncDocumentState }) {
  if (state.status === "empty") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-source p-6">
        <Empty className="max-w-lg border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Select a source file</EmptyTitle>
            <EmptyDescription>
              Choose a text-based LaTeX project file from the project tree to
              inspect it. Editing arrives in the next phase.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  if (state.status === "loading") {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 bg-source p-6"
        role="status"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle
            aria-hidden="true"
            className="size-3.5 motion-safe:animate-spin"
          />
          Reading {state.path}…
        </span>
        <Skeleton className="h-3 w-4/5 rounded" />
        <Skeleton className="h-3 w-3/5 rounded" />
        <Skeleton className="h-3 w-11/12 rounded" />
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center bg-source p-8">
        <Alert className="max-w-lg" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Couldn&apos;t display {state.path}</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1 bg-source">
      <pre className="min-h-full min-w-max p-6 font-mono text-[13px]/6 text-source-foreground selection:bg-primary/20">
        <code>{state.document.content}</code>
      </pre>
    </ScrollArea>
  )
}

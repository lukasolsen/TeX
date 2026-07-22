import { useEffect, useRef } from "react"
import { ChevronRight } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import {
  formatBuildInvocation,
  type BuildRun,
  type ProjectBuildState,
} from "@/domain/build"
import { PanelPlaceholder } from "@/features/build/panel-placeholder"

/**
 * Shows the exact command that produced (or will produce) the log directly
 * above it, the way a terminal echoes an invocation, instead of a separate
 * always-on metadata block.
 */
function BuildCommandLine({ state }: { state: ProjectBuildState }) {
  // Unavailable and errored previews are already stated in the panel status,
  // so echoing them here would only repeat the same sentence twice.
  if (
    state.preview.status === "unavailable" ||
    state.preview.status === "error"
  )
    return null
  const content =
    state.preview.status === "loading"
      ? "Preparing command…"
      : formatBuildInvocation(state.preview.invocation)
  const title =
    state.preview.status === "ready"
      ? `${content}\nWorking directory: ${state.preview.invocation.workingDirectory}\nRoot file: ${state.preview.invocation.rootFile}`
      : content
  return (
    <p
      className="flex min-w-0 shrink-0 items-center gap-1 border-b px-3 py-1 font-mono text-xs text-muted-foreground"
      title={title}
    >
      <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{content}</span>
    </p>
  )
}

export function BuildOutput({
  contextSequence,
  run,
  state,
}: {
  contextSequence: number | null
  run: BuildRun | null
  state: ProjectBuildState
}) {
  const scrollRoot = useRef<HTMLDivElement>(null)
  const followOutput = useRef(true)

  useEffect(() => {
    const viewport = scrollRoot.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']"
    )
    if (viewport === undefined || viewport === null) return
    const trackPosition = () => {
      followOutput.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32
    }
    viewport.addEventListener("scroll", trackPosition, { passive: true })
    return () => viewport.removeEventListener("scroll", trackPosition)
  }, [run?.id])

  useEffect(() => {
    const viewport = scrollRoot.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']"
    )
    if (viewport !== undefined && viewport !== null && followOutput.current) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [run?.entries.length, run?.id])

  useEffect(() => {
    if (contextSequence === null) return
    const entry = scrollRoot.current?.querySelector<HTMLElement>(
      `[data-log-sequence="${contextSequence}"]`
    )
    entry?.scrollIntoView({ block: "center" })
  }, [contextSequence, run?.id])

  return (
    <div className="flex size-full min-h-0 flex-col bg-source">
      <BuildCommandLine state={state} />
      {run === null ? (
        <PanelPlaceholder>
          No output yet. Build the project to capture the compiler log here.
        </PanelPlaceholder>
      ) : (
        <ScrollArea className="min-h-0 flex-1" ref={scrollRoot}>
          <ol
            className="min-h-full py-1.5 font-mono text-xs leading-5"
            aria-label="Raw build output"
          >
            {run.entries.length === 0 ? (
              <li className="px-3 text-muted-foreground">
                Waiting for compiler output…
              </li>
            ) : null}
            {run.entries.map((entry) => (
              <li
                className={
                  entry.sequence === contextSequence
                    ? "flex bg-accent px-3 text-accent-foreground"
                    : entry.stream === "stderr"
                      ? "flex px-3 text-destructive"
                      : "flex px-3 text-source-foreground"
                }
                data-log-sequence={entry.sequence}
                key={entry.sequence}
              >
                <span
                  className="mr-3 w-8 shrink-0 text-right text-muted-foreground/60 select-none"
                  aria-hidden="true"
                >
                  {entry.sequence}
                </span>
                {entry.stream === "stderr" ? (
                  <span className="sr-only">Standard error: </span>
                ) : null}
                <span className="min-w-0 break-words whitespace-pre-wrap">
                  {entry.text || " "}
                </span>
              </li>
            ))}
          </ol>
        </ScrollArea>
      )}
    </div>
  )
}

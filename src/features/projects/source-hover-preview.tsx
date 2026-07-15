import { useRef, useState, type ReactElement } from "react"
import { FileCode2, LoaderCircle } from "lucide-react"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import type { ProjectError, SourceDocument } from "@/domain/project"
import {
  projectErrorFromUnknown,
  readProjectSource,
} from "@/services/project-service"

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; document: SourceDocument }
  | { status: "error"; error: ProjectError }

/** Shows a bounded preview of a real, readable project source without changing the active editor. */
export function SourceHoverPreview({
  children,
  path,
  projectPath,
}: {
  children: ReactElement
  path: string
  projectPath: string
}) {
  const [state, setState] = useState<PreviewState>({ status: "idle" })
  const request = useRef(0)

  async function loadPreview() {
    if (state.status === "ready" || state.status === "loading") return
    const token = request.current + 1
    request.current = token
    setState({ status: "loading" })
    try {
      const document = await readProjectSource(projectPath, path)
      if (request.current === token) setState({ status: "ready", document })
    } catch (error: unknown) {
      if (request.current === token) {
        setState({ status: "error", error: projectErrorFromUnknown(error) })
      }
    }
  }

  return (
    <HoverCard onOpenChange={(open) => open && void loadPreview()}>
      <HoverCardTrigger closeDelay={160} delay={360} render={children} />
      <HoverCardContent
        align="start"
        className="w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/80 bg-popover p-0 shadow-xl"
        side="right"
        sideOffset={8}
      >
        <div className="flex items-center gap-2 border-b bg-muted/45 px-3 py-2 text-xs">
          <FileCode2 aria-hidden="true" className="size-3.5 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium">{path}</span>
          {state.status === "ready" ? (
            <span className="shrink-0 text-muted-foreground">
              {state.document.byteLength.toLocaleString()} bytes
            </span>
          ) : null}
        </div>
        {state.status === "loading" || state.status === "idle" ? (
          <p className="flex items-center gap-2 px-3 py-5 text-xs text-muted-foreground">
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 motion-safe:animate-spin"
            />
            Reading preview…
          </p>
        ) : state.status === "error" ? (
          <p className="px-3 py-5 text-xs text-muted-foreground">
            {state.error.message}
          </p>
        ) : (
          <pre className="max-h-80 overflow-auto bg-[var(--editor-preview)] px-3 py-3 font-mono text-[11px] leading-5 text-[var(--editor-preview-foreground)]">
            {state.document.content.slice(0, 8_000)}
            {state.document.content.length > 8_000 ? "\n…" : ""}
          </pre>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

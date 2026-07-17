import { FileText, ListTree } from "lucide-react"
import { useMemo, type ReactElement } from "react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { AsyncDocumentState } from "@/domain/project"
import { documentOutline } from "@/features/projects/document-outline"
import { cn } from "@/lib/utils"

export function DocumentOutlinePanel({
  activeLine,
  documentState,
  onNavigate,
}: {
  activeLine: number | null
  documentState: AsyncDocumentState
  onNavigate: (line: number) => void
}): ReactElement {
  const outlineContent =
    documentState.status === "ready" &&
    documentState.document.path.toLowerCase().endsWith(".tex")
      ? documentState.content
      : null
  const items = useMemo(
    () => (outlineContent === null ? [] : documentOutline(outlineContent)),
    [outlineContent]
  )
  if (documentState.status !== "ready" || outlineContent === null) {
    return (
      <Empty className="h-full p-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-sm">No document outline</EmptyTitle>
          <EmptyDescription className="text-xs">
            Open a TeX source file to navigate its sections.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const activeIndex =
    activeLine === null
      ? -1
      : items.findLastIndex((item) => item.line <= activeLine)

  if (items.length === 0) {
    return (
      <Empty className="h-full p-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTree aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-sm">No sections found</EmptyTitle>
          <EmptyDescription className="text-xs">
            Add a part, chapter, or section command to create an outline.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const baseLevel = Math.min(...items.map((item) => item.level))
  return (
    <nav aria-label={`Outline of ${documentState.document.path}`}>
      <p className="truncate border-b px-3 py-2 text-[11px] text-muted-foreground">
        {documentState.document.path}
      </p>
      <ol className="flex flex-col gap-0.5 p-1.5">
        {items.map((item, index) => (
          <li key={`${item.line}:${item.command}:${item.title}`}>
            <button
              aria-current={index === activeIndex ? "location" : undefined}
              className={cn(
                "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                index === activeIndex && "bg-sidebar-accent font-medium"
              )}
              onClick={() => onNavigate(item.line)}
              style={{
                paddingLeft: `${0.5 + Math.min(item.level - baseLevel, 4) * 0.75}rem`,
              }}
              title={`${item.command} · line ${item.line}`}
              type="button"
            >
              <span className="truncate">{item.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
                {item.line}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

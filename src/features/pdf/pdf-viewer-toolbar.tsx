import type { ReactElement } from "react"
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  ListTree,
  Maximize2,
  Minus,
  PanelLeftClose,
  Plus,
  RotateCw,
  Rows3,
  Search,
  Square,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { PdfViewerState } from "@/domain/project"
import { shortcutLabel } from "@/lib/shortcuts"
import { rotatePdfClockwise } from "@/features/pdf/pdf-viewer-model"

export function PdfViewerToolbar({
  viewer,
  numPages,
  canSyncToPdf,
  updateViewer,
  goToPage,
  onFitWidth,
  onFitPage,
  onOpenSearch,
  onForwardSearch,
  onClose,
}: {
  viewer: PdfViewerState
  numPages: number
  canSyncToPdf: boolean
  updateViewer: (update: Partial<PdfViewerState>) => void
  goToPage: (page: number) => void
  onFitWidth: () => void
  onFitPage: () => void
  onOpenSearch: () => void
  onForwardSearch: () => void
  onClose: () => void
}): ReactElement {
  const zoomPercent = Math.round(viewer.zoom * 100)
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-workspace-chrome px-1.5">
      <Button
        aria-label="Toggle document outline"
        onClick={() =>
          updateViewer({
            sidebar: viewer.sidebar === "outline" ? "none" : "outline",
          })
        }
        size="icon-xs"
        title="Document outline"
        variant={viewer.sidebar === "outline" ? "secondary" : "ghost"}
      >
        {viewer.sidebar === "outline" ? <PanelLeftClose /> : <ListTree />}
      </Button>
      <Separator className="mx-1 h-5" orientation="vertical" />
      <Button
        aria-label="Previous page"
        disabled={viewer.page <= 1}
        onClick={() => goToPage(viewer.page - 1)}
        size="icon-xs"
        title="Previous page"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>
      <label className="flex items-center gap-1 text-xs">
        <input
          aria-label="Page number"
          className="h-7 w-10 rounded-md border bg-background px-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
          key={viewer.page}
          onKeyDown={(event) => {
            if (event.key === "Enter")
              goToPage(Number(event.currentTarget.value))
          }}
          defaultValue={viewer.page}
          inputMode="numeric"
        />{" "}
        <span className="text-muted-foreground">/ {numPages}</span>
      </label>
      <Button
        aria-label="Next page"
        disabled={viewer.page >= numPages}
        onClick={() => goToPage(viewer.page + 1)}
        size="icon-xs"
        title="Next page"
        variant="ghost"
      >
        <ChevronRight />
      </Button>
      <Separator className="mx-1 h-5" orientation="vertical" />
      <Button
        aria-label="Zoom out"
        onClick={() =>
          updateViewer({ zoom: Math.max(0.25, viewer.zoom - 0.1) })
        }
        size="icon-xs"
        title="Zoom out"
        variant="ghost"
      >
        <Minus />
      </Button>
      <button
        className="min-w-12 rounded px-1 text-center text-xs tabular-nums hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => updateViewer({ zoom: 1 })}
        title="Reset to 100%"
        type="button"
      >
        {zoomPercent}%
      </button>
      <Button
        aria-label="Zoom in"
        onClick={() => updateViewer({ zoom: Math.min(5, viewer.zoom + 0.1) })}
        size="icon-xs"
        title="Zoom in"
        variant="ghost"
      >
        <Plus />
      </Button>
      <Button
        aria-label="Fit width"
        onClick={onFitWidth}
        size="icon-xs"
        title="Fit width"
        variant="ghost"
      >
        <ArrowLeftRight />
      </Button>
      <Button
        aria-label="Fit page"
        onClick={onFitPage}
        size="icon-xs"
        title="Fit page"
        variant="ghost"
      >
        <Maximize2 />
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button
          aria-label="Find in PDF"
          onClick={onOpenSearch}
          size="icon-xs"
          title={`Find in PDF (${shortcutLabel(["primary", "f"])})`}
          variant="ghost"
        >
          <Search />
        </Button>
        <Button
          aria-label="Synchronize source to PDF"
          disabled={!canSyncToPdf}
          onClick={onForwardSearch}
          size="icon-xs"
          title="Show source cursor in PDF"
          variant="ghost"
        >
          <Crosshair />
        </Button>
        <Button
          aria-label={
            viewer.layout === "continuous"
              ? "Use single-page layout"
              : "Use continuous layout"
          }
          onClick={() =>
            updateViewer({
              layout: viewer.layout === "continuous" ? "single" : "continuous",
            })
          }
          size="icon-xs"
          title={
            viewer.layout === "continuous" ? "Single page" : "Continuous pages"
          }
          variant="ghost"
        >
          {viewer.layout === "continuous" ? <Square /> : <Rows3 />}
        </Button>
        <Button
          aria-label="Rotate clockwise"
          onClick={() =>
            updateViewer({
              rotation: rotatePdfClockwise(viewer.rotation),
            })
          }
          size="icon-xs"
          title="Rotate clockwise"
          variant="ghost"
        >
          <RotateCw />
        </Button>
        <Separator className="mx-1 h-5" orientation="vertical" />
        <Button
          aria-label="Close PDF viewer"
          onClick={onClose}
          size="icon-xs"
          title="Close PDF viewer"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
    </div>
  )
}

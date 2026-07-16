import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FileSearch,
  ListTree,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelLeftClose,
  Plus,
  RotateCw,
  Rows3,
  Search,
  Square,
} from "lucide-react"
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist"
import "pdfjs-dist/web/pdf_viewer.css"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import type { PdfViewerState, ProjectError } from "@/domain/project"
import { cn } from "@/lib/utils"
import { normalizePdfOutline } from "@/features/pdf/pdf-viewer-model"
import {
  projectErrorFromUnknown,
  projectPdfRevision,
  readProjectPdf,
  synctexForwardSearch,
  synctexInverseSearch,
} from "@/services/project-service"

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

const defaultViewerState: PdfViewerState = {
  page: 1,
  position: 0,
  zoom: 1,
  rotation: 0,
  layout: "continuous",
  sidebar: "none",
}

type OutlineItem = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number]
type PdfLoadState =
  | { status: "loading" }
  | {
      status: "ready"
      document: PDFDocumentProxy
      updateError: ProjectError | null
    }
  | { status: "error"; error: ProjectError }

function PdfPage({
  document,
  pageNumber,
  rotation,
  scale,
  syncMarker,
  onInverseSearch,
}: {
  document: PDFDocumentProxy
  pageNumber: number
  rotation: number
  scale: number
  syncMarker: { page: number; x: number; y: number } | null
  onInverseSearch: (page: number, x: number, y: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)

  useEffect(() => {
    let active = true
    void document.getPage(pageNumber).then((value) => {
      if (active) setPage(value)
    })
    return () => {
      active = false
    }
  }, [document, pageNumber])

  useEffect(() => {
    if (page === null || canvasRef.current === null || textRef.current === null)
      return
    const canvas = canvasRef.current
    const textHost = textRef.current
    const viewport = page.getViewport({ scale, rotation })
    const outputScale = Math.min(window.devicePixelRatio || 1, 2.5)
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    textHost.replaceChildren()
    textHost.style.width = `${viewport.width}px`
    textHost.style.height = `${viewport.height}px`
    const renderTask = page.render({
      canvas,
      transform:
        outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      viewport,
    })
    let textLayer: TextLayer | null = null
    void page.getTextContent().then((content) => {
      textLayer = new TextLayer({
        container: textHost,
        textContentSource: content,
        viewport,
      })
      return textLayer.render()
    })
    return () => {
      renderTask.cancel()
      textLayer?.cancel()
    }
  }, [page, rotation, scale])

  if (page === null) {
    return <div className="aspect-[0.707] w-lg max-w-full bg-card shadow-sm" />
  }
  const viewport = page.getViewport({ scale, rotation })
  return (
    <article
      aria-label={`Page ${pageNumber}`}
      className="pdf-page relative shrink-0 bg-white shadow-[0_2px_12px_color-mix(in_oklch,var(--foreground)_16%,transparent)]"
      data-page={pageNumber}
      onClick={(event) => {
        if (!event.ctrlKey && !event.metaKey) return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        const viewport = page.getViewport({ scale, rotation })
        const [pdfX, pdfY] = viewport.convertToPdfPoint(
          event.clientX - bounds.left,
          event.clientY - bounds.top
        )
        onInverseSearch(pageNumber, pdfX, page.view[3] - pdfY)
      }}
      style={{ width: viewport.width, height: viewport.height }}
      title="Ctrl-click or Command-click to synchronize to source"
    >
      <canvas aria-hidden="true" ref={canvasRef} />
      <div className="textLayer" ref={textRef} />
      {syncMarker?.page === pageNumber && rotation === 0 ? (
        <span
          aria-label="Synchronized source location"
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/25 ring-4 ring-primary/15"
          style={{ left: syncMarker.x * scale, top: syncMarker.y * scale }}
        />
      ) : null}
    </article>
  )
}

function pageNumbers(
  count: number,
  layout: PdfViewerState["layout"],
  page: number
) {
  return layout === "single"
    ? [Math.max(1, Math.min(count, page))]
    : Array.from({ length: count }, (_, index) => index + 1)
}

export function PdfViewer({
  initialState,
  onStateChange,
  onNavigateSource,
  path,
  projectPath,
  refreshToken,
  sourceLocation,
}: {
  initialState: PdfViewerState | undefined
  onStateChange: (state: PdfViewerState) => void
  onNavigateSource: (path: string, line: number, column: number) => void
  path: string | null
  projectPath: string
  refreshToken: string
  sourceLocation: { path: string; line: number; column: number } | null
}) {
  const [viewer, setViewer] = useState(initialState ?? defaultViewerState)
  const [loadState, setLoadState] = useState<PdfLoadState>({
    status: "loading",
  })
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [query, setQuery] = useState("")
  const [matches, setMatches] = useState<number[]>([])
  const [matchIndex, setMatchIndex] = useState(0)
  const [externalRefresh, setExternalRefresh] = useState(0)
  const [syncMarker, setSyncMarker] = useState<{
    page: number
    x: number
    y: number
  } | null>(null)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const restoredDocument = useRef<PDFDocumentProxy | null>(null)
  const readyDocument = loadState.status === "ready" ? loadState.document : null

  useEffect(() => {
    if (path === null) return
    let active = true
    void readProjectPdf(projectPath, path)
      .then((data) => getDocument({ data }).promise)
      .then(async (document) => {
        if (!active) {
          await document.loadingTask.destroy()
          return
        }
        setLoadState({ status: "ready", document, updateError: null })
        setOutline(normalizePdfOutline(await document.getOutline()))
      })
      .catch((error: unknown) => {
        if (!active) return
        const projectError = projectErrorFromUnknown(error)
        setLoadState((current) =>
          current.status === "ready"
            ? { ...current, updateError: projectError }
            : { status: "error", error: projectError }
        )
      })
    return () => {
      active = false
    }
  }, [externalRefresh, path, projectPath, refreshToken])

  useEffect(
    () =>
      readyDocument === null
        ? undefined
        : () => {
            void readyDocument.loadingTask.destroy()
          },
    [readyDocument]
  )

  useEffect(() => {
    if (path === null) return
    let active = true
    let revision: string | null = null
    const check = async () => {
      try {
        const next = await projectPdfRevision(projectPath, path)
        if (!active) return
        if (revision !== null && revision !== next)
          setExternalRefresh((value) => value + 1)
        revision = next
      } catch {
        // A transient stat failure must not replace the last readable PDF.
      }
    }
    void check()
    const interval = window.setInterval(() => void check(), 2_500)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [path, projectPath])

  useEffect(() => {
    if (path === null) return
    const timeout = window.setTimeout(() => onStateChange(viewer), 250)
    return () => window.clearTimeout(timeout)
  }, [onStateChange, path, viewer])

  const updateViewer = useCallback((update: Partial<PdfViewerState>) => {
    setViewer((current) => ({ ...current, ...update }))
  }, [])

  const goToPage = useCallback(
    (page: number) => {
      if (readyDocument === null) return
      const next = Math.max(1, Math.min(readyDocument.numPages, page))
      updateViewer({ page: next, position: 0 })
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-page="${next}"]`)
        ?.scrollIntoView({ block: "start" })
    },
    [readyDocument, updateViewer]
  )

  const fit = useCallback(
    async (mode: "width" | "page") => {
      const host = scrollRef.current
      if (readyDocument === null || host === null) return
      const page = await readyDocument.getPage(viewer.page)
      const viewport = page.getViewport({ scale: 1, rotation: viewer.rotation })
      const horizontal = Math.max(
        0.25,
        (host.clientWidth - 40) / viewport.width
      )
      const vertical = Math.max(
        0.25,
        (host.clientHeight - 40) / viewport.height
      )
      updateViewer({
        zoom: Math.min(
          5,
          mode === "width" ? horizontal : Math.min(horizontal, vertical)
        ),
      })
    },
    [readyDocument, updateViewer, viewer.page, viewer.rotation]
  )

  useEffect(() => {
    const host = scrollRef.current
    if (
      readyDocument === null ||
      host === null ||
      restoredDocument.current === readyDocument
    )
      return
    restoredDocument.current = readyDocument
    const frame = window.requestAnimationFrame(() => {
      const page = host.querySelector<HTMLElement>(
        `[data-page="${viewer.page}"]`
      )
      if (page === null) return
      const available = Math.max(0, page.offsetHeight - host.clientHeight)
      host.scrollTop = page.offsetTop + available * viewer.position
    })
    return () => window.cancelAnimationFrame(frame)
  }, [
    readyDocument,
    viewer.layout,
    viewer.page,
    viewer.position,
    viewer.rotation,
    viewer.zoom,
  ])

  useEffect(() => {
    const root = scrollRef.current
    if (
      root === null ||
      readyDocument === null ||
      viewer.layout !== "continuous"
    )
      return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio
          )[0]
        const page = Number(
          (visible?.target as HTMLElement | undefined)?.dataset.page
        )
        if (Number.isFinite(page))
          setViewer((current) => ({ ...current, page }))
      },
      { root, threshold: [0.15, 0.4, 0.7] }
    )
    root
      .querySelectorAll("[data-page]")
      .forEach((page) => observer.observe(page))
    return () => observer.disconnect()
  }, [readyDocument, viewer.layout, viewer.rotation, viewer.zoom])

  const runSearch = useCallback(async () => {
    if (readyDocument === null || query.trim() === "") {
      setMatches([])
      return
    }
    const needle = query.toLocaleLowerCase()
    const found: number[] = []
    for (
      let pageNumber = 1;
      pageNumber <= readyDocument.numPages;
      pageNumber += 1
    ) {
      const page = await readyDocument.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .toLocaleLowerCase()
      if (text.includes(needle)) found.push(pageNumber)
    }
    setMatches(found)
    setMatchIndex(0)
    if (found[0] !== undefined) goToPage(found[0])
  }, [goToPage, query, readyDocument])

  useEffect(() => {
    const host = scrollRef.current
    if (host === null) return
    const timer = window.setTimeout(() => {
      host
        .querySelectorAll(".pdf-search-match")
        .forEach((node) => node.classList.remove("pdf-search-match"))
      if (query.trim() === "") return
      const needle = query.toLocaleLowerCase()
      for (const page of matches) {
        host
          .querySelectorAll<HTMLElement>(
            `[data-page="${page}"] .textLayer span`
          )
          .forEach((span) => {
            if (span.textContent?.toLocaleLowerCase().includes(needle))
              span.classList.add("pdf-search-match")
          })
      }
    }, 50)
    return () => window.clearTimeout(timer)
  }, [matches, query, viewer.zoom, viewer.rotation])

  const navigateOutline = useCallback(
    async (item: OutlineItem) => {
      if (readyDocument === null || item.dest === null) return
      const destination =
        typeof item.dest === "string"
          ? await readyDocument.getDestination(item.dest)
          : item.dest
      if (destination === null) return
      const reference = destination[0]
      const index =
        typeof reference === "object"
          ? await readyDocument.getPageIndex(reference)
          : 0
      goToPage(index + 1)
    },
    [goToPage, readyDocument]
  )

  const forwardSearch = useCallback(async () => {
    if (path === null || sourceLocation === null) return
    setSyncStatus("Synchronizing source to PDF…")
    try {
      const result = await synctexForwardSearch(
        projectPath,
        path,
        sourceLocation.path,
        sourceLocation.line,
        sourceLocation.column
      )
      setSyncMarker(result)
      goToPage(result.page)
      setSyncStatus(`Synchronized to page ${result.page}`)
    } catch (error: unknown) {
      setSyncStatus(projectErrorFromUnknown(error).message)
    }
  }, [goToPage, path, projectPath, sourceLocation])

  const inverseSearch = useCallback(
    async (page: number, x: number, y: number) => {
      if (path === null) return
      setSyncStatus("Synchronizing PDF to source…")
      try {
        const result = await synctexInverseSearch(projectPath, path, page, x, y)
        onNavigateSource(result.path, result.line, result.column)
        setSyncStatus(`Synchronized to ${result.path}, line ${result.line}`)
      } catch (error: unknown) {
        setSyncStatus(projectErrorFromUnknown(error).message)
      }
    },
    [onNavigateSource, path, projectPath]
  )

  const pages = useMemo(
    () =>
      readyDocument === null
        ? []
        : pageNumbers(readyDocument.numPages, viewer.layout, viewer.page),
    [readyDocument, viewer.layout, viewer.page]
  )

  if (path === null) {
    return (
      <section
        className="flex size-full items-center justify-center bg-workspace p-6"
        aria-label="PDF viewer"
      >
        <Empty className="max-w-sm border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearch aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Open a PDF</EmptyTitle>
            <EmptyDescription>
              Choose a PDF in the project files to read it beside your source.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    )
  }

  if (loadState.status === "loading") {
    return (
      <section
        className="flex size-full items-center justify-center gap-2 bg-workspace text-sm text-muted-foreground"
        aria-label="PDF viewer"
        role="status"
      >
        <LoaderCircle className="motion-safe:animate-spin" />
        Loading {path}…
      </section>
    )
  }
  if (loadState.status === "error") {
    return (
      <section
        className="flex size-full items-start justify-center bg-workspace p-6"
        aria-label="PDF viewer"
      >
        <Alert variant="destructive">
          <FileSearch />
          <AlertTitle>Couldn&apos;t open {path}</AlertTitle>
          <AlertDescription>{loadState.error.message}</AlertDescription>
        </Alert>
      </section>
    )
  }

  const zoomPercent = Math.round(viewer.zoom * 100)
  return (
    <section
      className="flex size-full min-h-0 min-w-0 flex-col bg-workspace"
      aria-label={`PDF viewer: ${path}`}
    >
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
          <span className="text-muted-foreground">
            / {loadState.document.numPages}
          </span>
        </label>
        <Button
          aria-label="Next page"
          disabled={viewer.page >= loadState.document.numPages}
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
          onClick={() => void fit("width")}
          size="icon-xs"
          title="Fit width"
          variant="ghost"
        >
          <ArrowLeftRight />
        </Button>
        <Button
          aria-label="Fit page"
          onClick={() => void fit("page")}
          size="icon-xs"
          title="Fit page"
          variant="ghost"
        >
          <Maximize2 />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            aria-label="Synchronize source to PDF"
            disabled={sourceLocation === null}
            onClick={() => void forwardSearch()}
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
                layout:
                  viewer.layout === "continuous" ? "single" : "continuous",
              })
            }
            size="icon-xs"
            title={
              viewer.layout === "continuous"
                ? "Single page"
                : "Continuous pages"
            }
            variant="ghost"
          >
            {viewer.layout === "continuous" ? <Square /> : <Rows3 />}
          </Button>
          <Button
            aria-label="Rotate clockwise"
            onClick={() =>
              updateViewer({
                rotation: ((viewer.rotation + 90) %
                  360) as PdfViewerState["rotation"],
              })
            }
            size="icon-xs"
            title="Rotate clockwise"
            variant="ghost"
          >
            <RotateCw />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {viewer.sidebar === "outline" ? (
          <aside
            className="w-52 shrink-0 overflow-y-auto border-r bg-sidebar p-2"
            aria-label="Document outline"
          >
            <p className="px-2 py-1.5 text-xs font-semibold">
              Document outline
            </p>
            {outline.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                This PDF has no outline.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {outline.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    <button
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => void navigateOutline(item)}
                      type="button"
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b bg-background px-2 py-1.5">
            <InputGroup className="max-w-sm">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Find in PDF"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runSearch()
                }}
                placeholder="Find in PDF"
                ref={searchInputRef}
                value={query}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={() => void runSearch()}>
                  Find
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <span className="text-xs text-muted-foreground" role="status">
              {matches.length === 0
                ? query === ""
                  ? "Selectable text"
                  : "No matches"
                : `${matchIndex + 1} of ${matches.length} pages`}
            </span>
            {syncStatus !== null ? (
              <span
                className="ml-auto max-w-64 truncate text-xs text-muted-foreground"
                role="status"
                title={syncStatus}
              >
                {syncStatus}
              </span>
            ) : null}
            {matches.length > 0 ? (
              <>
                <Button
                  aria-label="Previous search result"
                  onClick={() => {
                    const next =
                      (matchIndex - 1 + matches.length) % matches.length
                    setMatchIndex(next)
                    goToPage(matches[next])
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  aria-label="Next search result"
                  onClick={() => {
                    const next = (matchIndex + 1) % matches.length
                    setMatchIndex(next)
                    goToPage(matches[next])
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <ChevronRight />
                </Button>
              </>
            ) : null}
          </div>
          {loadState.updateError !== null ? (
            <Alert className="m-2 py-2" variant="destructive">
              <FileSearch />
              <AlertTitle>PDF update unavailable</AlertTitle>
              <AlertDescription>
                {loadState.updateError.message} The last readable PDF is still
                shown.
              </AlertDescription>
            </Alert>
          ) : null}
          <div
            className={cn(
              "min-h-0 flex-1 overflow-auto",
              viewer.layout === "single" && "flex items-start justify-center"
            )}
            onScroll={(event) => {
              const host = event.currentTarget
              const page = host.querySelector<HTMLElement>(
                `[data-page="${viewer.page}"]`
              )
              if (page === null) return
              const available = Math.max(
                1,
                page.offsetHeight - host.clientHeight
              )
              const position = Math.max(
                0,
                Math.min(1, (host.scrollTop - page.offsetTop) / available)
              )
              setViewer((current) =>
                Math.abs(current.position - position) < 0.01
                  ? current
                  : { ...current, position }
              )
            }}
            onKeyDown={(event) => {
              const modifier = event.ctrlKey || event.metaKey
              if (modifier && event.key.toLocaleLowerCase() === "f") {
                event.preventDefault()
                event.stopPropagation()
                searchInputRef.current?.focus()
              } else if (modifier && (event.key === "+" || event.key === "=")) {
                event.preventDefault()
                event.stopPropagation()
                updateViewer({ zoom: Math.min(5, viewer.zoom + 0.1) })
              } else if (modifier && event.key === "-") {
                event.preventDefault()
                event.stopPropagation()
                updateViewer({ zoom: Math.max(0.25, viewer.zoom - 0.1) })
              } else if (event.key === "PageDown") {
                event.preventDefault()
                goToPage(viewer.page + 1)
              } else if (event.key === "PageUp") {
                event.preventDefault()
                goToPage(viewer.page - 1)
              }
            }}
            ref={scrollRef}
            tabIndex={0}
          >
            <div className="flex min-h-full min-w-max flex-col items-center gap-5 p-5">
              {pages.map((page) => (
                <PdfPage
                  document={loadState.document}
                  key={page}
                  onInverseSearch={(pageNumber, x, y) =>
                    void inverseSearch(pageNumber, x, y)
                  }
                  pageNumber={page}
                  rotation={viewer.rotation}
                  scale={viewer.zoom}
                  syncMarker={syncMarker}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        Page {viewer.page} of {loadState.document.numPages}
      </span>
    </section>
  )
}

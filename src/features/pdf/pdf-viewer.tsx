import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactElement } from "react"
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
  X,
} from "lucide-react"
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayerImages,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
  type PDFPageProxy,
} from "pdfjs-dist"
import { TextLayerBuilder } from "pdfjs-dist/web/pdf_viewer.mjs"
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
  InputGroupInput,
} from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import type { PdfViewerState, ProjectError } from "@/domain/project"
import type { PdfPreferences } from "@/domain/preferences"
import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import { cn } from "@/lib/utils"
import { shortcutLabel } from "@/lib/shortcuts"
import { runDetached } from "@/lib/promises"
import {
  boundedPdfOutputScale,
  flattenPdfOutline,
  type FlatPdfOutlineItem,
  MAX_PDF_PAGE_CSS_DIMENSION,
  MAX_PDF_SEARCH_MATCH_PAGES,
  MAX_SUPPORTED_PDF_PAGES,
  normalizePdfOutline,
  pdfPageSizeSupported,
  pdfViewportScale,
  rotatePdfClockwise,
  shouldRenderPdfPage,
  stateAfterPdfReplacement,
} from "@/features/pdf/pdf-viewer-model"
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

/** The state a PDF opens in the first time it is viewed. Once a document has a
 * remembered state, that state wins: a preference change never moves a reader. */
function initialViewerState(defaults: PdfPreferences): PdfViewerState {
  return {
    page: 1,
    position: 0,
    zoom: defaults.defaultZoom,
    rotation: 0,
    layout: defaults.defaultLayout,
    sidebar: defaults.defaultSidebar,
  }
}

function destroyPdfTask(task: PDFDocumentLoadingTask): void {
  void task.destroy().catch(() => {
    // Destruction is terminal; no document state remains to recover.
  })
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

type PdfUpdateOrigin = "initial" | "build" | "external"
type PendingPdfUpdate = Readonly<{
  document: PDFDocumentProxy
  outline: ReadonlyArray<FlatPdfOutlineItem<OutlineItem>>
  outlineTruncated: boolean
  origin: PdfUpdateOrigin
  generation: number
}>

function PdfPage({
  active,
  document,
  pageNumber,
  rotation,
  scale,
  searchNeedle,
  syncMarker,
  onInverseSearch,
  onTextLayerReady,
}: {
  active: boolean
  document: PDFDocumentProxy
  pageNumber: number
  rotation: number
  scale: number
  searchNeedle: string | null
  syncMarker: { page: number; x: number; y: number } | null
  onInverseSearch: (page: number, x: number, y: number) => void
  onTextLayerReady: (page: number) => void
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [pageError, setPageError] = useState(false)
  const [baseSize, setBaseSize] = useState({ width: 612, height: 792 })
  const [textLayerRevision, setTextLayerRevision] = useState(0)

  useEffect(() => {
    if (!active) {
      setPage(null)
      return
    }
    let requestActive = true
    setPageError(false)
    void document
      .getPage(pageNumber)
      .then((value) => {
        if (!requestActive) return
        const viewport = value.getViewport({
          scale: pdfViewportScale(1),
          rotation: 0,
        })
        if (!pdfPageSizeSupported(viewport.width, viewport.height)) {
          value.cleanup()
          setPageError(true)
          return
        }
        setBaseSize({ width: viewport.width, height: viewport.height })
        setPage(value)
      })
      .catch(() => {
        if (requestActive) setPageError(true)
      })
    return () => {
      requestActive = false
    }
  }, [active, document, pageNumber])

  useEffect(() => {
    if (
      !active ||
      page === null ||
      canvasRef.current === null ||
      textRef.current === null
    ) {
      return
    }

    const canvas = canvasRef.current
    const textHost = textRef.current
    const viewport = page.getViewport({
      scale: pdfViewportScale(scale),
      rotation,
    })
    setPageError(false)

    if (!pdfPageSizeSupported(viewport.width, viewport.height)) {
      setPageError(true)
      return
    }

    const outputScale = boundedPdfOutputScale(
      viewport.width,
      viewport.height,
      window.devicePixelRatio
    )

    if (outputScale === null) {
      setPageError(true)
      return
    }

    canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
    canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    textHost.replaceChildren()

    // Match the render transform to the allocated integer bitmap exactly. This
    // avoids a second fractional rescale when the viewport has subpixel edges.
    const outputScaleX = canvas.width / viewport.width
    const outputScaleY = canvas.height / viewport.height

    const renderTask = page.render({
      canvas,
      transform:
        outputScaleX === 1 && outputScaleY === 1
          ? undefined
          : [outputScaleX, 0, 0, outputScaleY, 0, 0],
      viewport,
    })
    const textLayer = new TextLayerBuilder({
      pdfPage: page,
      onAppend: (layer: HTMLDivElement) => {
        layer.style.width = `${viewport.width}px`
        layer.style.height = `${viewport.height}px`
        textHost.replaceChildren(layer)
      },
    })
    let effectActive = true

    void renderTask.promise.catch((error: unknown) => {
      if (
        effectActive &&
        (!(error instanceof Error) ||
          error.name !== "RenderingCancelledException")
      ) {
        setPageError(true)
      }
    })

    void textLayer
      .render({
        viewport,
        images: new TextLayerImages(
          0,
          new Float32Array(),
          viewport,
          () => canvas
        ),
      })
      .then(() => {
        if (effectActive) {
          setTextLayerRevision((current) => current + 1)
          onTextLayerReady(pageNumber)
        }
      })
      .catch(() => {
        // Canvas rendering remains usable when selectable text is unavailable.
      })

    return () => {
      effectActive = false
      renderTask.cancel()
      textLayer.cancel()
      canvas.width = 0
      canvas.height = 0
      textHost.replaceChildren()
    }
  }, [active, onTextLayerReady, page, pageNumber, rotation, scale])

  useEffect(() => () => void page?.cleanup(), [page])

  useEffect(() => {
    const textHost = textRef.current
    if (textHost === null) return
    for (const span of textHost.querySelectorAll(".pdf-search-match")) {
      span.classList.remove("pdf-search-match")
    }
    if (searchNeedle === null || searchNeedle === "") return
    const needle = searchNeedle.toLowerCase()
    for (const span of textHost.querySelectorAll<HTMLElement>("span")) {
      if (span.textContent?.toLowerCase().includes(needle)) {
        span.classList.add("pdf-search-match")
      }
    }
  }, [searchNeedle, textLayerRevision])

  const viewport = page?.getViewport({
    scale: pdfViewportScale(scale),
    rotation,
  })
  const rawWidth =
    viewport?.width ??
    (rotation % 180 === 0 ? baseSize.width : baseSize.height) * scale
  const rawHeight =
    viewport?.height ??
    (rotation % 180 === 0 ? baseSize.height : baseSize.width) * scale
  const displayScale = Math.min(
    1,
    MAX_PDF_PAGE_CSS_DIMENSION / rawWidth,
    MAX_PDF_PAGE_CSS_DIMENSION / rawHeight
  )
  const width = rawWidth * displayScale
  const height = rawHeight * displayScale
  const pageHeight = page?.view[3] ?? 0
  return (
    <div
      aria-label={`Page ${pageNumber}`}
      className="pdf-page relative shrink-0 bg-white shadow-[0_2px_12px_color-mix(in_oklch,var(--foreground)_16%,transparent)]"
      data-page={pageNumber}
      onClick={(event) => {
        if (!event.ctrlKey && !event.metaKey) return
        if (page === null) return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        const viewport = page.getViewport({
          scale: pdfViewportScale(scale),
          rotation,
        })
        const [pdfX, pdfY] = viewport.convertToPdfPoint(
          event.clientX - bounds.left,
          event.clientY - bounds.top
        )
        onInverseSearch(pageNumber, pdfX, pageHeight - pdfY)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return
        if (page === null || viewport === undefined) return
        event.preventDefault()
        const [pdfX, pdfY] = viewport.convertToPdfPoint(
          viewport.width / 2,
          viewport.height / 2
        )
        onInverseSearch(pageNumber, pdfX, pageHeight - pdfY)
      }}
      role="button"
      style={{ width, height }}
      tabIndex={page === null ? -1 : 0}
      title={`${shortcutLabel(["primary"])}-click to synchronize to source`}
    >
      <canvas aria-hidden="true" ref={canvasRef} />
      <div className="pointer-events-none absolute inset-0" ref={textRef} />
      {pageError ? (
        <span className="absolute inset-0 grid place-items-center text-sm text-destructive">
          Page {pageNumber} could not be rendered.
        </span>
      ) : null}
      {syncMarker?.page === pageNumber && rotation === 0 ? (
        <span
          aria-label="Synchronized source location"
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/25 ring-4 ring-primary/15"
          style={{
            left: syncMarker.x * pdfViewportScale(scale),
            top: syncMarker.y * pdfViewportScale(scale),
          }}
        />
      ) : null}
    </div>
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

type PdfTextSelection = Readonly<{ page: number; text: string }>

function restorePdfSelection(
  root: HTMLElement,
  selectionToRestore: PdfTextSelection | null
): boolean {
  if (
    selectionToRestore === null ||
    selectionToRestore.text === "" ||
    !document.getSelection()?.isCollapsed
  )
    return false
  for (const span of root.querySelectorAll<HTMLElement>(
    `[data-page="${selectionToRestore.page}"] .textLayer span`
  )) {
    const content = span.textContent ?? ""
    const offset = content.indexOf(selectionToRestore.text)
    const node = span.firstChild
    if (offset < 0 || node === null) continue
    const range = document.createRange()
    range.setStart(node, offset)
    range.setEnd(node, offset + selectionToRestore.text.length)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return true
  }
  return false
}

export function PdfViewer({
  defaults,
  initialState,
  onClose,
  onStateChange,
  onNavigateSource,
  path,
  projectPath,
  refreshToken,
  sourceLocation,
}: {
  defaults: PdfPreferences
  initialState: PdfViewerState | undefined
  onClose: () => void
  onStateChange: (state: PdfViewerState) => void
  onNavigateSource: (
    path: ProjectRelativePath,
    line: number,
    column: number
  ) => void
  path: ProjectRelativePath | null
  projectPath: CanonicalProjectPath
  refreshToken: string
  sourceLocation: {
    path: ProjectRelativePath
    line: number
    column: number
  } | null
}): ReactElement {
  const [viewer, setViewer] = useState(
    () => initialState ?? initialViewerState(defaults)
  )
  const [loadState, setLoadState] = useState<PdfLoadState>({
    status: "loading",
  })
  const [outline, setOutline] = useState<
    ReadonlyArray<FlatPdfOutlineItem<OutlineItem>>
  >([])
  const [outlineTruncated, setOutlineTruncated] = useState(false)
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [matches, setMatches] = useState<number[]>([])
  const [matchIndex, setMatchIndex] = useState(0)
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "searching" | "ready" | "truncated" | "error"
  >("idle")
  const [externalRefresh, setExternalRefresh] = useState(0)
  const [syncMarker, setSyncMarker] = useState<{
    page: number
    x: number
    y: number
  } | null>(null)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [pendingUpdate, setPendingUpdate] = useState<PendingPdfUpdate | null>(
    null
  )
  const [updateAnnouncement, setUpdateAnnouncement] = useState("")
  const sectionRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const restoredDocument = useRef<PDFDocumentProxy | null>(null)
  const readyDocumentRef = useRef<PDFDocumentProxy | null>(null)
  const viewerRef = useRef(viewer)
  const onStateChangeRef = useRef(onStateChange)
  const pathRef = useRef(path)
  const loadGeneration = useRef(0)
  const searchGeneration = useRef(0)
  const outlineGeneration = useRef(0)
  const syncGeneration = useRef(0)
  const interactionUntil = useRef(0)
  const selectionActive = useRef(false)
  const selectedText = useRef<PdfTextSelection | null>(null)
  const selectionToRestore = useRef<PdfTextSelection | null>(null)
  const restoreFrame = useRef<number | null>(null)
  const lastBuildToken = useRef("")
  const pendingUpdateRef = useRef<PendingPdfUpdate | null>(null)
  const readyDocument = loadState.status === "ready" ? loadState.document : null
  const closeViewer = useCallback(() => {
    if (path !== null) onStateChange(viewer)
    onClose()
  }, [onClose, onStateChange, path, viewer])

  const markInteraction = useCallback((duration = 500) => {
    interactionUntil.current = performance.now() + duration
  }, [])

  const applyUpdate = useCallback((candidate: PendingPdfUpdate) => {
    if (candidate.generation !== loadGeneration.current) {
      destroyPdfTask(candidate.document.loadingTask)
      if (pendingUpdateRef.current === candidate) {
        pendingUpdateRef.current = null
        setPendingUpdate(null)
      }
      return
    }
    searchGeneration.current += 1
    outlineGeneration.current += 1
    syncGeneration.current += 1
    const focused = document.activeElement
    const restoreFocus =
      focused instanceof HTMLElement &&
      sectionRef.current?.contains(focused) === true
        ? focused
        : null
    const replacement = stateAfterPdfReplacement(
      viewerRef.current,
      candidate.document.numPages
    )
    const currentSelection = selectedText.current
    selectionToRestore.current =
      currentSelection !== null &&
      currentSelection.page <= candidate.document.numPages
        ? currentSelection
        : null
    setViewer(replacement.state)
    viewerRef.current = replacement.state
    setLoadState({
      status: "ready",
      document: candidate.document,
      updateError: null,
    })
    setOutline(candidate.outline)
    setOutlineTruncated(candidate.outlineTruncated)
    pendingUpdateRef.current = null
    setPendingUpdate(null)
    const source =
      candidate.origin === "build"
        ? "Build PDF updated"
        : candidate.origin === "external"
          ? "Externally rebuilt PDF updated"
          : "PDF loaded"
    setUpdateAnnouncement(
      replacement.pageClamped
        ? `${source}; previous page no longer exists; showing page ${replacement.state.page} of ${candidate.document.numPages}.`
        : `${source}; page ${replacement.state.page} of ${candidate.document.numPages}.`
    )
    if (restoreFrame.current !== null) {
      window.cancelAnimationFrame(restoreFrame.current)
    }
    restoreFrame.current = window.requestAnimationFrame(() => {
      restoreFrame.current = null
      if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true })
    })
  }, [])

  useEffect(
    () => () => {
      if (restoreFrame.current !== null) {
        window.cancelAnimationFrame(restoreFrame.current)
      }
    },
    []
  )

  useEffect(
    () => () => {
      searchGeneration.current += 1
      outlineGeneration.current += 1
      syncGeneration.current += 1
    },
    []
  )

  useEffect(() => {
    viewerRef.current = viewer
    onStateChangeRef.current = onStateChange
    pathRef.current = path
  }, [onStateChange, path, viewer])

  useEffect(
    () => () => {
      if (pathRef.current !== null) {
        onStateChangeRef.current(viewerRef.current)
      }
    },
    []
  )

  useEffect(() => {
    if (path === null) return
    let active = true
    let loadingTask: PDFDocumentLoadingTask | null = null
    let ownershipTransferred = false
    const generation = loadGeneration.current + 1
    loadGeneration.current = generation
    const origin: PdfUpdateOrigin =
      refreshToken !== "" && refreshToken !== lastBuildToken.current
        ? "build"
        : externalRefresh > 0
          ? "external"
          : "initial"
    lastBuildToken.current = refreshToken
    const load = async (): Promise<void> => {
      try {
        const data = await readProjectPdf(projectPath, path)
        if (!active || generation !== loadGeneration.current) return
        loadingTask = getDocument({ data })
        const document = await loadingTask.promise
        if (!active || generation !== loadGeneration.current) return
        if (document.numPages > MAX_SUPPORTED_PDF_PAGES) {
          throw {
            code: "pdf-page-limit",
            message: `This PDF has more than ${MAX_SUPPORTED_PDF_PAGES.toLocaleString()} pages and cannot be opened safely.`,
          }
        }
        const flattenedOutline = flattenPdfOutline(
          normalizePdfOutline(await document.getOutline().catch(() => null))
        )
        if (!active || generation !== loadGeneration.current) return
        const candidate = {
          document,
          outline: flattenedOutline.items,
          outlineTruncated: flattenedOutline.truncated,
          origin,
          generation,
        }
        ownershipTransferred = true
        if (
          readyDocumentRef.current !== null &&
          (selectionActive.current ||
            performance.now() < interactionUntil.current)
        ) {
          const currentPending = pendingUpdateRef.current
          if (currentPending !== null) {
            destroyPdfTask(currentPending.document.loadingTask)
          }
          pendingUpdateRef.current = candidate
          setPendingUpdate(candidate)
          setUpdateAnnouncement(
            origin === "build"
              ? "Build PDF update ready; waiting for PDF interaction to finish."
              : "External PDF update ready; waiting for PDF interaction to finish."
          )
        } else {
          applyUpdate(candidate)
        }
      } catch (error: unknown) {
        if (!active || generation !== loadGeneration.current) return
        if (loadingTask !== null && !ownershipTransferred) {
          destroyPdfTask(loadingTask)
          loadingTask = null
        }
        const projectError = projectErrorFromUnknown(error)
        setLoadState((current) =>
          current.status === "ready"
            ? { ...current, updateError: projectError }
            : { status: "error", error: projectError }
        )
      }
    }
    void load()
    return () => {
      active = false
      loadGeneration.current += 1
      if (loadingTask !== null && !ownershipTransferred) {
        destroyPdfTask(loadingTask)
      }
    }
  }, [applyUpdate, externalRefresh, path, projectPath, refreshToken])

  useEffect(
    () =>
      readyDocument === null
        ? undefined
        : () => {
            destroyPdfTask(readyDocument.loadingTask)
          },
    [readyDocument]
  )

  useEffect(() => {
    readyDocumentRef.current = readyDocument
  }, [readyDocument])

  useEffect(() => {
    pendingUpdateRef.current = pendingUpdate
  }, [pendingUpdate])

  useEffect(
    () => () => {
      const pending = pendingUpdateRef.current
      if (pending !== null) destroyPdfTask(pending.document.loadingTask)
    },
    []
  )

  useEffect(() => {
    if (pendingUpdate === null) return
    const interval = window.setInterval(() => {
      if (
        !selectionActive.current &&
        performance.now() >= interactionUntil.current
      ) {
        applyUpdate(pendingUpdate)
      }
    }, 100)
    return () => window.clearInterval(interval)
  }, [applyUpdate, pendingUpdate])

  useEffect(() => {
    const trackSelection = () => {
      const selection = document.getSelection()
      const root = sectionRef.current
      selectionActive.current =
        selection !== null &&
        !selection.isCollapsed &&
        root !== null &&
        ((selection.anchorNode !== null &&
          root.contains(selection.anchorNode)) ||
          (selection.focusNode !== null && root.contains(selection.focusNode)))
      if (selectionActive.current) {
        const anchorElement =
          selection?.anchorNode instanceof Element
            ? selection.anchorNode
            : selection?.anchorNode?.parentElement
        const page = Number(
          anchorElement?.closest<HTMLElement>("[data-page]")?.dataset.page
        )
        selectedText.current = Number.isFinite(page)
          ? { page, text: selection?.toString() ?? "" }
          : null
        markInteraction(1_000)
      } else {
        selectedText.current = null
      }
    }
    document.addEventListener("selectionchange", trackSelection)
    return () => document.removeEventListener("selectionchange", trackSelection)
  }, [markInteraction])

  useEffect(() => {
    if (path === null) return
    let active = true
    let checking = false
    let revision: string | null = null
    const check = async (): Promise<void> => {
      if (checking) return
      checking = true
      try {
        const next = await projectPdfRevision(projectPath, path)
        if (!active) return
        if (revision !== null && revision !== next)
          setExternalRefresh((value) => value + 1)
        revision = next
      } catch {
        // A transient stat failure must not replace the last readable PDF.
      } finally {
        checking = false
      }
    }
    void check()
    const interval = window.setInterval(() => void check(), 2_500)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [path, projectPath, refreshToken])

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
      if (!Number.isFinite(page)) {
        setSyncStatus("Enter a valid PDF page number.")
        return
      }
      const next = Math.max(
        1,
        Math.min(readyDocument.numPages, Math.trunc(page))
      )
      updateViewer({ page: next, position: 0 })
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-page="${next}"]`)
        ?.scrollIntoView({ block: "start" })
    },
    [readyDocument, updateViewer]
  )

  const fit = useCallback(
    async (mode: "width" | "page"): Promise<void> => {
      const host = scrollRef.current
      if (readyDocument === null || host === null) return
      try {
        const page = await readyDocument.getPage(viewer.page)
        if (readyDocumentRef.current !== readyDocument) return
        const viewport = page.getViewport({
          scale: pdfViewportScale(1),
          rotation: viewer.rotation,
        })
        if (!pdfPageSizeSupported(viewport.width, viewport.height)) {
          throw new Error("PDF page geometry is outside the viewer limit.")
        }
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
      } catch {
        setSyncStatus("Could not calculate the requested PDF fit.")
      }
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

  const runSearch = useCallback(async () => {
    const generation = searchGeneration.current + 1
    searchGeneration.current = generation
    const normalizedQuery = query.trim()
    if (readyDocument === null || normalizedQuery === "") {
      setMatches([])
      setSearchStatus("idle")
      return
    }
    setSearchStatus("searching")
    const needle = normalizedQuery.toLowerCase()
    const found: number[] = []
    let truncated = false
    try {
      for (
        let pageNumber = 1;
        pageNumber <= readyDocument.numPages;
        pageNumber += 1
      ) {
        if (generation !== searchGeneration.current) return
        const page = await readyDocument.getPage(pageNumber)
        try {
          const content = await page.getTextContent()
          if (generation !== searchGeneration.current) return
          const text = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
            .toLowerCase()
          if (text.includes(needle)) {
            found.push(pageNumber)
            if (found.length === MAX_PDF_SEARCH_MATCH_PAGES) {
              truncated = pageNumber < readyDocument.numPages
              break
            }
          }
        } finally {
          if (Math.abs(pageNumber - viewerRef.current.page) > 2) page.cleanup()
        }
      }
    } catch {
      if (generation === searchGeneration.current) setSearchStatus("error")
      return
    }
    if (generation !== searchGeneration.current) return
    setMatches(found)
    setMatchIndex(0)
    setSearchStatus(truncated ? "truncated" : "ready")
    if (found[0] !== undefined) goToPage(found[0])
  }, [goToPage, query, readyDocument])

  const navigateOutline = useCallback(
    async (item: OutlineItem): Promise<void> => {
      if (readyDocument === null || item.dest === null) return
      const generation = outlineGeneration.current + 1
      outlineGeneration.current = generation
      try {
        const destination =
          typeof item.dest === "string"
            ? await readyDocument.getDestination(item.dest)
            : item.dest
        if (destination === null) return
        if (generation !== outlineGeneration.current) return
        const reference = destination[0]
        const index =
          typeof reference === "object"
            ? await readyDocument.getPageIndex(reference)
            : 0
        if (generation !== outlineGeneration.current) return
        goToPage(index + 1)
      } catch {
        if (generation === outlineGeneration.current) {
          setSyncStatus("This PDF outline destination is unavailable.")
        }
      }
    },
    [goToPage, readyDocument]
  )

  const forwardSearch = useCallback(async () => {
    if (path === null || sourceLocation === null) return
    const generation = syncGeneration.current + 1
    syncGeneration.current = generation
    setSyncStatus("Synchronizing source to PDF…")
    try {
      const result = await synctexForwardSearch({
        projectPath,
        pdfPath: path,
        sourcePath: sourceLocation.path,
        line: sourceLocation.line,
        column: sourceLocation.column,
      })
      if (generation !== syncGeneration.current) return
      setSyncMarker(result)
      goToPage(result.page)
      setSyncStatus(`Synchronized to page ${result.page}`)
    } catch (error: unknown) {
      if (generation !== syncGeneration.current) return
      setSyncStatus(projectErrorFromUnknown(error).message)
    }
  }, [goToPage, path, projectPath, sourceLocation])

  const inverseSearch = useCallback(
    async (page: number, x: number, y: number) => {
      if (path === null) return
      const generation = syncGeneration.current + 1
      syncGeneration.current = generation
      setSyncStatus("Synchronizing PDF to source…")
      try {
        const result = await synctexInverseSearch({
          projectPath,
          pdfPath: path,
          page,
          x,
          y,
        })
        if (generation !== syncGeneration.current) return
        onNavigateSource(result.path, result.line, result.column)
        setSyncStatus(`Synchronized to ${result.path}, line ${result.line}`)
      } catch (error: unknown) {
        if (generation !== syncGeneration.current) return
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
  const matchPages = useMemo(() => new Set(matches), [matches])
  const handleTextLayerReady = useCallback((page: number): void => {
    const pendingSelection = selectionToRestore.current
    const root = sectionRef.current
    if (
      pendingSelection?.page === page &&
      root !== null &&
      restorePdfSelection(root, pendingSelection)
    ) {
      selectionToRestore.current = null
    }
  }, [])

  useEffect(() => {
    const host = scrollRef.current
    if (host === null || readyDocument === null) return
    const onPointerDown = (): void => markInteraction(1_000)
    const onPointerUp = (): void => markInteraction()
    const onKeyDown = (event: KeyboardEvent): void => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault()
        event.stopPropagation()
        setSearchOpen(true)
        window.requestAnimationFrame(() => searchInputRef.current?.focus())
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
    }
    host.addEventListener("pointerdown", onPointerDown)
    host.addEventListener("pointerup", onPointerUp)
    host.addEventListener("keydown", onKeyDown)
    return () => {
      host.removeEventListener("pointerdown", onPointerDown)
      host.removeEventListener("pointerup", onPointerUp)
      host.removeEventListener("keydown", onKeyDown)
    }
  }, [
    goToPage,
    markInteraction,
    readyDocument,
    updateViewer,
    viewer.page,
    viewer.zoom,
  ])

  if (path === null) {
    return (
      <section
        className="relative flex size-full items-center justify-center bg-workspace p-6"
        aria-label="PDF viewer"
        data-workspace-focus="pdf"
        tabIndex={-1}
      >
        <Button
          aria-label="Close PDF viewer"
          className="absolute top-2 right-2"
          onClick={closeViewer}
          size="icon-xs"
          title="Close PDF viewer"
          variant="ghost"
        >
          <X />
        </Button>
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
        className="relative flex size-full items-center justify-center gap-2 bg-workspace text-sm text-muted-foreground"
        aria-label="PDF viewer"
        data-workspace-focus="pdf"
        role="status"
        tabIndex={-1}
      >
        <Button
          aria-label="Close PDF viewer"
          className="absolute top-2 right-2"
          onClick={closeViewer}
          size="icon-xs"
          title="Close PDF viewer"
          variant="ghost"
        >
          <X />
        </Button>
        <LoaderCircle className="motion-safe:animate-spin" />
        Loading {path}…
      </section>
    )
  }
  if (loadState.status === "error") {
    return (
      <section
        className="relative flex size-full items-start justify-center bg-workspace p-6"
        aria-label="PDF viewer"
        data-workspace-focus="pdf"
        tabIndex={-1}
      >
        <Button
          aria-label="Close PDF viewer"
          className="absolute top-2 right-2"
          onClick={closeViewer}
          size="icon-xs"
          title="Close PDF viewer"
          variant="ghost"
        >
          <X />
        </Button>
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
      data-workspace-focus="pdf"
      ref={sectionRef}
      tabIndex={-1}
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
          onClick={() => runDetached(fit("width"))}
          size="icon-xs"
          title="Fit width"
          variant="ghost"
        >
          <ArrowLeftRight />
        </Button>
        <Button
          aria-label="Fit page"
          onClick={() => runDetached(fit("page"))}
          size="icon-xs"
          title="Fit page"
          variant="ghost"
        >
          <Maximize2 />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            aria-label="Find in PDF"
            onClick={() => {
              setSearchOpen(true)
              window.requestAnimationFrame(() =>
                searchInputRef.current?.focus()
              )
            }}
            size="icon-xs"
            title={`Find in PDF (${shortcutLabel(["primary", "f"])})`}
            variant="ghost"
          >
            <Search />
          </Button>
          <Button
            aria-label="Synchronize source to PDF"
            disabled={sourceLocation === null}
            onClick={() => runDetached(forwardSearch())}
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
            onClick={closeViewer}
            size="icon-xs"
            title="Close PDF viewer"
            variant="ghost"
          >
            <X />
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
                {outline.map(({ depth, item }, index) => (
                  <li key={`${item.title}-${index}`}>
                    <button
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => runDetached(navigateOutline(item))}
                      style={{ paddingInlineStart: `${0.5 + depth * 0.75}rem` }}
                      type="button"
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {outlineTruncated ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Additional outline entries are omitted to keep navigation
                responsive.
              </p>
            ) : null}
          </aside>
        ) : null}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {searchOpen ? (
            <div className="absolute top-2 right-3 z-20 flex w-[min(30rem,calc(100%-1.5rem))] items-center gap-1 rounded-md border bg-popover p-1 shadow-overlay">
              <InputGroup className="min-w-0 flex-1">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Find in PDF"
                  maxLength={256}
                  onChange={(event) => {
                    searchGeneration.current += 1
                    setQuery(event.target.value)
                    setMatches([])
                    setMatchIndex(0)
                    setSearchStatus("idle")
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") runDetached(runSearch())
                    if (event.key === "Escape") setSearchOpen(false)
                  }}
                  placeholder="Find in PDF"
                  ref={searchInputRef}
                  value={query}
                />
              </InputGroup>
              <span
                className="shrink-0 text-xs text-muted-foreground"
                role="status"
              >
                {searchStatus === "searching"
                  ? "Searching PDF…"
                  : searchStatus === "error"
                    ? "PDF search failed"
                    : searchStatus === "truncated"
                      ? `First ${matches.length} matching pages`
                      : matches.length === 0
                        ? query === "" || searchStatus === "idle"
                          ? query === ""
                            ? "Selectable text"
                            : "Press Enter to search"
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
                      const pageNumber = matches[next]
                      if (pageNumber !== undefined) goToPage(pageNumber)
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
                      const pageNumber = matches[next]
                      if (pageNumber !== undefined) goToPage(pageNumber)
                    }}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <ChevronRight />
                  </Button>
                </>
              ) : null}
              <Button
                aria-label="Close PDF find"
                onClick={() => setSearchOpen(false)}
                size="icon-xs"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
          ) : null}
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
          {pendingUpdate !== null ? (
            <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs">
              <span>
                {pendingUpdate.origin === "build"
                  ? "Build PDF update ready"
                  : "External PDF update ready"}
                ; waiting for scrolling or text selection to finish.
              </span>
              <Button
                className="ml-auto"
                onClick={() => applyUpdate(pendingUpdate)}
                size="xs"
                variant="outline"
              >
                Apply update now
              </Button>
            </div>
          ) : null}
          <div
            aria-label="PDF pages"
            className={cn(
              "min-h-0 flex-1 overflow-auto",
              viewer.layout === "single" && "flex items-start justify-center"
            )}
            onScroll={(event) => {
              markInteraction()
              const host = event.currentTarget
              const bounds = host.getBoundingClientRect()
              const target = document.elementFromPoint(
                bounds.left + bounds.width / 2,
                bounds.top + Math.min(40, bounds.height / 2)
              )
              const visiblePage = target?.closest<HTMLElement>("[data-page]")
              const pageNumber = Number(visiblePage?.dataset.page)
              const page =
                Number.isFinite(pageNumber) && visiblePage !== undefined
                  ? visiblePage
                  : host.querySelector<HTMLElement>(
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
                current.page === pageNumber &&
                Math.abs(current.position - position) < 0.01
                  ? current
                  : {
                      ...current,
                      page: Number.isFinite(pageNumber)
                        ? pageNumber
                        : current.page,
                      position,
                    }
              )
            }}
            ref={scrollRef}
            role="region"
          >
            <div className="flex min-h-full min-w-max flex-col items-center gap-5 p-5">
              {pages.map((page) => (
                <PdfPage
                  active={
                    viewer.layout === "single" ||
                    shouldRenderPdfPage(page, viewer.page)
                  }
                  document={loadState.document}
                  key={page}
                  onInverseSearch={(pageNumber, x, y) =>
                    runDetached(inverseSearch(pageNumber, x, y))
                  }
                  onTextLayerReady={handleTextLayerReady}
                  pageNumber={page}
                  rotation={viewer.rotation}
                  scale={viewer.zoom}
                  searchNeedle={matchPages.has(page) ? query.trim() : null}
                  syncMarker={syncMarker}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {updateAnnouncement ||
          `Page ${viewer.page} of ${loadState.document.numPages}`}
      </span>
    </section>
  )
}

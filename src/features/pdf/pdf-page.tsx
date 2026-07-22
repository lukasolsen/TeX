import { useEffect, useRef, useState } from "react"
import type { ReactElement } from "react"
import {
  TextLayerImages,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist"
import { TextLayerBuilder } from "pdfjs-dist/web/pdf_viewer.mjs"
import "pdfjs-dist/web/pdf_viewer.css"

import { shortcutLabel } from "@/lib/shortcuts"
import {
  boundedPdfOutputScale,
  MAX_PDF_PAGE_CSS_DIMENSION,
  pdfPageSizeSupported,
  pdfViewportScale,
} from "@/features/pdf/pdf-viewer-model"

export function PdfPage({
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
        const clickViewport = page.getViewport({
          scale: pdfViewportScale(scale),
          rotation,
        })
        const [pdfX, pdfY] = clickViewport.convertToPdfPoint(
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

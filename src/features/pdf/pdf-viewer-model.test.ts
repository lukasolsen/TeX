import { describe, expect, it } from "vitest"

import {
  applyPdfCandidate,
  boundedPdfOutputScale,
  flattenPdfOutline,
  MAX_PDF_CANVAS_DIMENSION,
  MAX_PDF_CANVAS_PIXELS,
  MAX_PDF_SEARCH_MATCH_PAGES,
  MAX_SUPPORTED_PDF_PAGES,
  normalizePdfOutline,
  pdfPageSizeSupported,
  rotatePdfClockwise,
  stateAfterPdfReplacement,
  shouldRenderPdfPage,
} from "@/features/pdf/pdf-viewer-model"
import type { PdfViewerState } from "@/domain/project"

describe("PDF viewer model", () => {
  it("treats a PDF without an outline as an empty outline", () => {
    expect(normalizePdfOutline(null)).toEqual([])
  })

  it("retains available outline entries", () => {
    const outline = [{ title: "Introduction" }]
    expect(normalizePdfOutline(outline)).toEqual(outline)
  })

  it("flattens nested entries in order and enforces the render budget", () => {
    const leaf = { title: "Leaf", items: [] }
    const outline = [
      { title: "One", items: [leaf] },
      { title: "Two", items: [] },
    ]
    expect(flattenPdfOutline(outline, 2)).toEqual({
      items: [
        { depth: 0, item: outline[0] },
        { depth: 1, item: leaf },
      ],
      truncated: true,
    })
  })
})

describe("PDF resource limits", () => {
  it("rejects invalid page geometry and defines a finite page budget", () => {
    expect(MAX_SUPPORTED_PDF_PAGES).toBe(2_048)
    expect(MAX_PDF_SEARCH_MATCH_PAGES).toBe(500)
    expect(pdfPageSizeSupported(Number.POSITIVE_INFINITY, 792)).toBe(false)
    expect(pdfPageSizeSupported(612, 792)).toBe(true)
  })

  it("keeps continuous rendering to a five-page neighborhood", () => {
    expect(
      Array.from({ length: 100 }, (_, index) => index + 1).filter((page) =>
        shouldRenderPdfPage(page, 50)
      )
    ).toEqual([48, 49, 50, 51, 52])
  })

  it("bounds high-density canvas allocation", () => {
    const scale = boundedPdfOutputScale(10_000, 10_000, 3)
    expect(scale).not.toBeNull()
    if (scale === null) return
    expect(10_000 * scale).toBeLessThanOrEqual(MAX_PDF_CANVAS_DIMENSION)
    const canvasDimension = Math.floor(10_000 * scale)
    expect(canvasDimension * canvasDimension).toBeLessThanOrEqual(
      MAX_PDF_CANVAS_PIXELS
    )
  })
})

describe("PDF rotation", () => {
  it("cycles through the supported quarter turns", () => {
    expect(
      ([0, 90, 180, 270] as const).map((value) => rotatePdfClockwise(value))
    ).toEqual([90, 180, 270, 0])
  })
})

const readingState: PdfViewerState = {
  page: 42,
  position: 0.63,
  zoom: 1.75,
  rotation: 90,
  layout: "continuous",
  sidebar: "outline",
}

describe("PDF replacement state", () => {
  it("preserves every reading field and clamps only a removed page", () => {
    expect(stateAfterPdfReplacement(readingState, 30)).toEqual({
      state: { ...readingState, page: 30 },
      pageClamped: true,
    })
  })

  it("survives 100 successful and 100 failed updates without resetting context", () => {
    let current = { revision: 0, viewer: readingState }
    for (let revision = 1; revision <= 100; revision += 1) {
      current = applyPdfCandidate(current, { revision, pageCount: 120 })
      expect(current.viewer).toEqual(readingState)
    }
    const lastGood = current
    for (let failure = 0; failure < 100; failure += 1) {
      current = applyPdfCandidate(current, null)
      expect(current).toBe(lastGood)
    }
  })
})

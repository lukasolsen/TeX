import { describe, expect, it } from "vitest"

import {
  applyPdfCandidate,
  normalizePdfOutline,
  stateAfterPdfReplacement,
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

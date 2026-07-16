import { describe, expect, it } from "vitest"

import { normalizePdfOutline } from "@/features/pdf/pdf-viewer-model"

describe("PDF viewer model", () => {
  it("treats a PDF without an outline as an empty outline", () => {
    expect(normalizePdfOutline(null)).toEqual([])
  })

  it("retains available outline entries", () => {
    const outline = [{ title: "Introduction" }]
    expect(normalizePdfOutline(outline)).toEqual(outline)
  })
})

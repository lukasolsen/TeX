import type { PdfViewerState } from "@/domain/project"

export const MAX_SUPPORTED_PDF_PAGES = 2_048
export const MAX_PDF_SEARCH_MATCH_PAGES = 500
export const MAX_PDF_PAGE_CSS_DIMENSION = 16_384
export const MAX_PDF_CANVAS_DIMENSION = 8_192
export const MAX_PDF_CANVAS_PIXELS = 32 * 1024 * 1024
export const PDF_TO_CSS_UNITS = 96 / 72

/** Converts the user-facing PDF zoom to PDF.js's CSS-pixel viewport scale. */
export function pdfViewportScale(zoom: number): number {
  return zoom * PDF_TO_CSS_UNITS
}

export function pdfPageSizeSupported(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_PDF_PAGE_CSS_DIMENSION &&
    height <= MAX_PDF_PAGE_CSS_DIMENSION
  )
}

export function boundedPdfOutputScale(
  width: number,
  height: number,
  deviceScale: number
): number | null {
  if (!pdfPageSizeSupported(width, height)) return null
  const requested = Math.max(
    2,
    Number.isFinite(deviceScale) && deviceScale > 0 ? deviceScale : 1
  )
  return Math.max(
    0.1,
    Math.min(
      requested,
      MAX_PDF_CANVAS_DIMENSION / width,
      MAX_PDF_CANVAS_DIMENSION / height,
      Math.sqrt(MAX_PDF_CANVAS_PIXELS / (width * height))
    )
  )
}

export function shouldRenderPdfPage(
  page: number,
  currentPage: number,
  radius = 2
): boolean {
  return Math.abs(page - currentPage) <= radius
}

/** Normalizes PDF.js's nullable outline response at the library boundary. */
export function normalizePdfOutline<T>(outline: readonly T[] | null): T[] {
  return outline === null ? [] : [...outline]
}

export type FlatPdfOutlineItem<Item> = Readonly<{
  depth: number
  item: Item
}>

export type FlatPdfOutline<Item> = Readonly<{
  items: ReadonlyArray<FlatPdfOutlineItem<Item>>
  truncated: boolean
}>

/** Bounds recursive outline rendering while preserving document order. */
export function flattenPdfOutline<Item extends { items: readonly Item[] }>(
  outline: readonly Item[],
  maximumItems = 2_048,
  maximumDepth = 32
): FlatPdfOutline<Item> {
  const flattened: Array<FlatPdfOutlineItem<Item>> = []
  let truncated = false
  const visit = (items: readonly Item[], depth: number): void => {
    if (depth > maximumDepth) {
      if (items.length > 0) truncated = true
      return
    }
    for (const item of items) {
      if (flattened.length >= maximumItems) {
        truncated = true
        return
      }
      flattened.push({ depth, item })
      visit(item.items, depth + 1)
    }
  }
  visit(outline, 0)
  return { items: flattened, truncated }
}

/** Preserves user-owned reading state while clamping only an unavailable page. */
export function stateAfterPdfReplacement(
  state: PdfViewerState,
  pageCount: number
): { state: PdfViewerState; pageClamped: boolean } {
  const page = Math.max(1, Math.min(Math.max(1, pageCount), state.page))
  return {
    state: { ...state, page },
    pageClamped: page !== state.page,
  }
}

export type LastGoodPdfState = Readonly<{
  revision: number
  viewer: PdfViewerState
}>

export function rotatePdfClockwise(
  rotation: PdfViewerState["rotation"]
): PdfViewerState["rotation"] {
  switch (rotation) {
    case 0:
      return 90
    case 90:
      return 180
    case 180:
      return 270
    case 270:
      return 0
  }
}

/** A failed candidate never mutates the last readable document or viewer state. */
export function applyPdfCandidate(
  current: LastGoodPdfState,
  candidate: { revision: number; pageCount: number } | null
): LastGoodPdfState {
  if (candidate === null) return current
  return {
    revision: candidate.revision,
    viewer: stateAfterPdfReplacement(current.viewer, candidate.pageCount).state,
  }
}

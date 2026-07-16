import type { PdfViewerState } from "@/domain/project"

/** Normalizes PDF.js's nullable outline response at the library boundary. */
export function normalizePdfOutline<T>(outline: readonly T[] | null): T[] {
  return outline === null ? [] : [...outline]
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

export type LastGoodPdfState = {
  revision: number
  viewer: PdfViewerState
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

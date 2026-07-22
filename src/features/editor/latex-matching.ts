/**
 * Highlights the `\begin` and `\end` that belong to each other.
 *
 * `bracketMatching()` pairs braces and brackets, which leaves LaTeX's most
 * error-prone delimiter — an environment spanning fifty lines — unmatched. The
 * pair comes from the structural model, so a mismatched or unclosed environment
 * is marked as such rather than silently paired with the wrong one.
 */

import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"
import { Decoration, type DecorationSet } from "@codemirror/view"
import type { EditorState, Extension } from "@codemirror/state"

import type { LatexDocumentModel, LatexRegion } from "@/domain/latex-syntax"
import { latexModelOf } from "@/features/editor/latex-model"

export type LatexDelimiterMatch = Readonly<{
  open: { from: number; to: number }
  /** `null` when the environment is never closed. */
  close: { from: number; to: number } | null
  name: string
  matched: boolean
}>

/**
 * The environment whose `\begin` or `\end` the cursor sits on, or `null`.
 *
 * Only the delimiters themselves count, not the body: a cursor inside a
 * hundred-line figure should not permanently light up its endpoints.
 */
export function latexDelimiterMatchAt(
  model: LatexDocumentModel,
  position: number
): LatexDelimiterMatch | null {
  let best: LatexRegion | null = null
  for (const region of model.regions) {
    if (region.kind !== "environment" && region.kind !== "verbatim") continue
    const onOpen = position >= region.from && position <= region.bodyFrom
    const onClose =
      region.closed && position >= region.bodyTo && position <= region.to
    if (!onOpen && !onClose) continue
    // Prefer the innermost region whose delimiter contains the cursor.
    if (best === null || region.from >= best.from) best = region
  }
  if (best === null) return null
  return {
    open: { from: best.from, to: best.bodyFrom },
    close: best.closed ? { from: best.bodyTo, to: best.to } : null,
    name: best.name,
    matched: best.closed,
  }
}

const matchedMark = Decoration.mark({ class: "cm-latex-matching-delimiter" })
const unmatchedMark = Decoration.mark({
  class: "cm-latex-nonmatching-delimiter",
})

function delimiterDecorations(state: EditorState): DecorationSet {
  const ranges = []
  for (const range of state.selection.ranges) {
    if (!range.empty) continue
    const match = latexDelimiterMatchAt(latexModelOf(state.doc), range.head)
    if (match === null) continue
    const mark = match.matched ? matchedMark : unmatchedMark
    ranges.push(mark.range(match.open.from, match.open.to))
    if (match.close !== null) {
      ranges.push(mark.range(match.close.from, match.close.to))
    }
  }
  ranges.sort((left, right) => left.from - right.from)
  return Decoration.set(ranges)
}

/** Marks the matching `\begin`/`\end` pair around the cursor. */
export function latexDelimiterMatching(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = delimiterDecorations(view.state)
      }

      update(update: ViewUpdate) {
        if (!update.docChanged && !update.selectionSet) return
        this.decorations = delimiterDecorations(update.state)
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}

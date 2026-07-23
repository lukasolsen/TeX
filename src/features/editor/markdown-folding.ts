/**
 * Folding for Markdown: a heading collapses its section, a fenced block
 * collapses its code, and the front matter collapses as a unit.
 */

import { foldService } from "@codemirror/language"
import type { Extension, Text } from "@codemirror/state"

import { markdownFoldRanges, type MarkdownFoldRange } from "@/domain/markdown"
import { foldPresentation } from "@/features/editor/fold-presentation"

const cache = new WeakMap<Text, Map<number, MarkdownFoldRange>>()

function foldRangesFor(doc: Text): Map<number, MarkdownFoldRange> {
  const cached = cache.get(doc)
  if (cached !== undefined) return cached
  const ranges = markdownFoldRanges(doc.toString())
  cache.set(doc, ranges)
  return ranges
}

/** How a folded range is named when its placeholder is announced. */
function describe(fold: MarkdownFoldRange): string {
  switch (fold.kind) {
    case "heading":
      return `section ${fold.name}`
    case "fence":
      return "a code block"
    case "front-matter":
      return "the front matter"
  }
}

export function markdownFolding(): Extension {
  return [
    foldPresentation((state, from) => {
      const fold = foldRangesFor(state.doc).get(state.doc.lineAt(from).number)
      return fold === undefined ? "lines" : describe(fold)
    }),
    foldService.of((state, lineStart) => {
      const range = foldRangesFor(state.doc).get(
        state.doc.lineAt(lineStart).number
      )
      return range === undefined ? null : { from: range.from, to: range.to }
    }),
  ]
}

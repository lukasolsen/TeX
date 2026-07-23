/**
 * Folding for BibTeX: one fold per entry, which is the only block a `.bib`
 * file has.
 */

import { foldService } from "@codemirror/language"
import type { Extension, Text } from "@codemirror/state"

import { bibtexEntries } from "@/domain/bibtex"
import { foldPresentation } from "@/features/editor/fold-presentation"

type BibtexFold = Readonly<{ from: number; to: number; name: string }>

function foldRanges(doc: Text): Map<number, BibtexFold> {
  const ranges = new Map<number, BibtexFold>()
  for (const entry of bibtexEntries(doc.toString())) {
    const line = doc.lineAt(entry.from)
    const to = Math.min(entry.to, doc.length)
    if (doc.lineAt(to).number <= line.number) continue
    ranges.set(line.number, {
      from: line.to,
      to,
      name: entry.key ?? `@${entry.type}`,
    })
  }
  return ranges
}

const cache = new WeakMap<Text, Map<number, BibtexFold>>()

function foldRangesFor(doc: Text): Map<number, BibtexFold> {
  const cached = cache.get(doc)
  if (cached !== undefined) return cached
  const ranges = foldRanges(doc)
  cache.set(doc, ranges)
  return ranges
}

export function bibtexFolding(): Extension {
  return [
    foldPresentation((state, from) => {
      const fold = foldRangesFor(state.doc).get(state.doc.lineAt(from).number)
      return fold === undefined ? "lines" : `the ${fold.name} entry`
    }),
    foldService.of((state, lineStart) => {
      const range = foldRangesFor(state.doc).get(
        state.doc.lineAt(lineStart).number
      )
      return range === undefined ? null : { from: range.from, to: range.to }
    }),
  ]
}

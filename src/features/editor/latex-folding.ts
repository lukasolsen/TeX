/**
 * Folding driven by the structural model.
 *
 * A LaTeX author's sense of "a block" is a sectioning command, an environment,
 * a display equation, or a run of commented-out prose. All four come from the
 * one model, so a fold can never disagree with the delimiter highlighted next
 * to it.
 */

import {
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
  unfoldCode,
} from "@codemirror/language"
import { keymap } from "@codemirror/view"
import type { Extension, Text } from "@codemirror/state"

import { SECTION_LEVELS, type LatexDocumentModel } from "@/domain/latex-syntax"
import { latexModelOf } from "@/features/editor/latex-model"

export type LatexFoldRange = Readonly<{
  /** End of the line the construct opens on: the fold starts after it. */
  from: number
  to: number
  /** What was folded, for the placeholder's accessible name. */
  kind: "section" | "environment" | "math" | "comment" | "preamble"
  name: string
}>

/**
 * The fold ranges of a document, keyed by the 1-based line they start on.
 *
 * A construct that opens and closes on one line is not foldable, and where two
 * constructs open on the same line the larger one wins, so folding a heading
 * that begins with an environment does not collapse only the environment.
 */
export function latexFoldRanges(
  doc: Text,
  model: LatexDocumentModel = latexModelOf(doc)
): Map<number, LatexFoldRange> {
  const ranges = new Map<number, LatexFoldRange>()

  const offer = (range: LatexFoldRange) => {
    const line = doc.lineAt(range.from)
    if (range.to <= range.from || doc.lineAt(range.to).number <= line.number) {
      return
    }
    const existing = ranges.get(line.number)
    if (existing === undefined || range.to > existing.to) {
      ranges.set(line.number, range)
    }
  }

  const documentBody = model.regions.find(
    (region) => region.kind === "environment" && region.name === "document"
  )

  for (const region of model.regions) {
    if (region.kind === "comment") {
      offer({
        from: doc.lineAt(region.from).to,
        to: region.to,
        kind: "comment",
        name: "comment",
      })
      continue
    }
    if (region.kind === "math") {
      offer({
        from: doc.lineAt(region.from).to,
        to: region.bodyTo,
        kind: "math",
        name: region.name,
      })
      continue
    }
    offer({
      from: doc.lineAt(Math.min(region.bodyFrom, doc.length)).to,
      to: region.bodyTo,
      kind: "environment",
      name: region.name,
    })
  }

  const headings = model.occurrences
    .filter((occurrence) => occurrence.role === "section")
    .map((occurrence) => ({
      from: occurrence.from,
      level: SECTION_LEVELS.get(occurrence.command) ?? 0,
      name: occurrence.name,
    }))

  for (const [index, heading] of headings.entries()) {
    const next = headings
      .slice(index + 1)
      .find((candidate) => candidate.level <= heading.level)
    // A heading runs until the next heading of the same or shallower depth,
    // or to the end of the document body.
    const limit =
      next === undefined
        ? (documentBody?.bodyTo ?? doc.length)
        : doc.lineAt(next.from).from - 1
    offer({
      from: doc.lineAt(heading.from).to,
      to: Math.min(limit, doc.length),
      kind: "section",
      name: heading.name,
    })
  }

  const preambleEnd = documentBody?.from
  const classDeclaration = model.occurrences.find(
    (occurrence) => occurrence.role === "document-class"
  )
  if (preambleEnd !== undefined && classDeclaration !== undefined) {
    offer({
      from: doc.lineAt(classDeclaration.from).to,
      to: doc.lineAt(preambleEnd).from - 1,
      kind: "preamble",
      name: "preamble",
    })
  }

  return ranges
}

const cache = new WeakMap<Text, Map<number, LatexFoldRange>>()

function foldRangesFor(doc: Text): Map<number, LatexFoldRange> {
  const cached = cache.get(doc)
  if (cached !== undefined) return cached
  const ranges = latexFoldRanges(doc)
  cache.set(doc, ranges)
  return ranges
}

/** Folding, its gutter, the fold service, and the standard fold keymap. */
export function latexFolding(): Extension {
  return [
    codeFolding({
      preparePlaceholder: (state, range) => {
        const fold = foldRangesFor(state.doc).get(
          state.doc.lineAt(range.from).number
        )
        const lines =
          state.doc.lineAt(range.to).number -
          state.doc.lineAt(range.from).number
        const what = fold === undefined ? "lines" : describe(fold)
        return `${lines} folded ${lines === 1 ? "line" : "lines"} of ${what}`
      },
      placeholderDOM: (view, onclick, prepared) => {
        // A folded range must be reachable and reversible from the keyboard,
        // not only by clicking the gutter marker.
        const button = document.createElement("button")
        button.className = "cm-latex-fold-placeholder"
        button.type = "button"
        button.textContent = "⋯"
        button.setAttribute(
          "aria-label",
          typeof prepared === "string" ? `Unfold ${prepared}` : "Unfold"
        )
        button.title = typeof prepared === "string" ? prepared : "Folded"
        button.addEventListener("click", onclick)
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          unfoldCode(view)
        })
        return button
      },
    }),
    foldGutter({
      markerDOM: (open) => {
        const marker = document.createElement("span")
        marker.className = `cm-latex-fold-marker${open ? "" : " cm-latex-fold-marker-closed"}`
        marker.textContent = open ? "\u25BE" : "\u25B8"
        marker.setAttribute("aria-hidden", "true")
        return marker
      },
    }),
    foldService.of((state, lineStart) => {
      const range = foldRangesFor(state.doc).get(
        state.doc.lineAt(lineStart).number
      )
      return range === undefined ? null : { from: range.from, to: range.to }
    }),
    keymap.of(foldKeymap),
  ]
}

/** How a folded range is named when its placeholder is announced. */
function describe(fold: LatexFoldRange): string {
  switch (fold.kind) {
    case "section":
      return `section ${fold.name}`
    case "environment":
      return `the ${fold.name} environment`
    case "math":
      return "display mathematics"
    case "comment":
      return "comments"
    case "preamble":
      return "the preamble"
  }
}

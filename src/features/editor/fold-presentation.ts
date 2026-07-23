/**
 * The parts of folding every language shares: the gutter marker, the
 * placeholder, and the fold keymap.
 *
 * Each language supplies only its own fold ranges and the words that name what
 * a range holds, so a folded BibTeX entry and a folded LaTeX environment are
 * announced in the same shape and operated with the same keys.
 */

import {
  codeFolding,
  foldGutter,
  foldKeymap,
  unfoldCode,
} from "@codemirror/language"
import type { EditorState, Extension } from "@codemirror/state"
import { keymap } from "@codemirror/view"

/**
 * Names what the fold starting at `from` holds, in a form that reads after
 * "folded lines of" — for example "the figure environment".
 */
export type FoldSubject = (state: EditorState, from: number) => string

export function foldPresentation(subject: FoldSubject): Extension {
  return [
    codeFolding({
      preparePlaceholder: (state, range) => {
        const lines =
          state.doc.lineAt(range.to).number -
          state.doc.lineAt(range.from).number
        return `${lines} folded ${lines === 1 ? "line" : "lines"} of ${subject(state, range.from)}`
      },
      placeholderDOM: (view, onclick, prepared) => {
        // A folded range must be reachable and reversible from the keyboard,
        // not only by clicking the gutter marker.
        const button = document.createElement("button")
        button.className = "cm-source-fold-placeholder"
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
        marker.className = `cm-source-fold-marker${open ? "" : " cm-source-fold-marker-closed"}`
        marker.textContent = open ? "\u25BE" : "\u25B8"
        marker.setAttribute("aria-hidden", "true")
        return marker
      },
    }),
    keymap.of(foldKeymap),
  ]
}

import { EditorState } from "@codemirror/state"
import {
  StreamLanguage,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language"
import { stex } from "@codemirror/legacy-modes/mode/stex"
import { highlightTree } from "@lezer/highlight"
import { describe, expect, it } from "vitest"

import { latexHighlightStyle } from "@/features/editor/latex-highlighting"

describe("LaTeX highlighting", () => {
  it("assigns stable CSS classes to LaTeX tokens", () => {
    const source = "\\documentclass{article}\n% A note\n\\begin{document}"
    const state = EditorState.create({
      doc: source,
      extensions: [
        StreamLanguage.define(stex),
        syntaxHighlighting(latexHighlightStyle),
      ],
    })
    const tokens: Array<{ text: string; className: string }> = []

    highlightTree(
      syntaxTree(state),
      [latexHighlightStyle],
      (from, to, className) => {
        tokens.push({ text: source.slice(from, to), className })
      }
    )

    expect(tokens).toEqual([
      { text: "\\documentclass", className: "cm-latex-command" },
      { text: "{", className: "cm-latex-bracket" },
      { text: "}", className: "cm-latex-bracket" },
      { text: "% A note", className: "cm-latex-comment" },
      { text: "\\begin", className: "cm-latex-command" },
      { text: "{", className: "cm-latex-bracket" },
      { text: "document", className: "cm-latex-argument" },
      { text: "}", className: "cm-latex-bracket" },
    ])
  })
})

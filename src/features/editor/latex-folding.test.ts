import { Text } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { latexFoldRanges } from "@/features/editor/latex-folding"

/** The folded text of every range, keyed by the line the fold opens on. */
function folds(lines: string[]) {
  const doc = Text.of(lines)
  return [...latexFoldRanges(doc).entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([line, range]) => ({
      line,
      kind: range.kind,
      name: range.name,
      folded: doc.sliceString(range.from, range.to),
    }))
}

describe("fold ranges", () => {
  it("folds an environment from its opening line to its closing line", () => {
    const found = folds([
      "\\begin{itemize}",
      "  \\item one",
      "  \\item two",
      "\\end{itemize}",
    ])

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      line: 1,
      kind: "environment",
      name: "itemize",
    })
    expect(found[0]?.folded).toBe("\n  \\item one\n  \\item two\n")
  })

  it("does not offer a fold for a construct that fits on one line", () => {
    expect(folds(["\\begin{center}x\\end{center}"])).toEqual([])
  })

  it("folds a section up to the next heading of the same depth", () => {
    const found = folds([
      "\\section{One}",
      "first",
      "\\subsection{Inner}",
      "nested",
      "\\section{Two}",
      "second",
    ])

    const one = found.find((fold) => fold.name === "One")
    expect(one?.kind).toBe("section")
    expect(one?.folded).toBe("\nfirst\n\\subsection{Inner}\nnested")

    const inner = found.find((fold) => fold.name === "Inner")
    expect(inner?.folded).toBe("\nnested")
  })

  it("stops the last section at the end of the document body", () => {
    const found = folds([
      "\\begin{document}",
      "\\section{Only}",
      "body",
      "\\end{document}",
    ])

    expect(found.find((fold) => fold.name === "Only")?.folded).toBe("\nbody\n")
  })

  it("folds the preamble between the class declaration and the body", () => {
    const found = folds([
      "\\documentclass{article}",
      "\\usepackage{amsmath}",
      "\\usepackage{graphicx}",
      "\\begin{document}",
      "\\end{document}",
    ])

    expect(found.find((fold) => fold.kind === "preamble")?.folded).toBe(
      "\n\\usepackage{amsmath}\n\\usepackage{graphicx}"
    )
  })

  it("folds a display equation and a run of comments", () => {
    const found = folds([
      "\\[",
      "  x = 1",
      "\\]",
      "% note one",
      "% note two",
      "text",
    ])

    expect(found.map((fold) => fold.kind)).toEqual(["math", "comment"])
  })

  it("keeps the larger fold when two constructs open on one line", () => {
    const found = folds([
      "\\section{Head} \\begin{itemize}",
      "  \\item a",
      "\\end{itemize}",
      "tail",
    ])

    expect(found).toHaveLength(1)
    expect(found[0]?.kind).toBe("section")
  })

  it("offers no fold for an environment that is never closed", () => {
    // The region runs to the end of the document, which folds nothing useful
    // and would hide the rest of the file behind one placeholder.
    const found = folds(["text", "\\begin{itemize}", "\\item a"])

    expect(found.map((fold) => fold.folded)).toEqual(["\n\\item a"])
  })
})

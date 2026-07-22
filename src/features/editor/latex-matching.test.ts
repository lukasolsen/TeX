import { describe, expect, it } from "vitest"

import { parseLatexDocument } from "@/domain/latex-syntax"
import { latexDelimiterMatchAt } from "@/features/editor/latex-matching"

function matchAt(source: string, position: number) {
  const match = latexDelimiterMatchAt(parseLatexDocument(source), position)
  if (match === null) return null
  return {
    name: match.name,
    matched: match.matched,
    open: source.slice(match.open.from, match.open.to),
    close:
      match.close === null
        ? null
        : source.slice(match.close.from, match.close.to),
  }
}

describe("environment delimiter matching", () => {
  const source = "\\begin{figure}\n  body\n\\end{figure}"

  it("pairs the delimiters from either end", () => {
    const expected = {
      name: "figure",
      matched: true,
      open: "\\begin{figure}",
      close: "\\end{figure}",
    }

    expect(matchAt(source, source.indexOf("\\begin") + 3)).toEqual(expected)
    expect(matchAt(source, source.indexOf("\\end") + 3)).toEqual(expected)
  })

  it("does not light up the delimiters from inside the body", () => {
    expect(matchAt(source, source.indexOf("body"))).toBeNull()
  })

  it("pairs the innermost environment when they nest", () => {
    const nested = "\\begin{figure}\\begin{center}x\\end{center}\\end{figure}"

    expect(matchAt(nested, nested.indexOf("\\begin{center}") + 3)?.name).toBe(
      "center"
    )
  })

  it("marks an unclosed environment as unmatched with no partner", () => {
    const match = matchAt("\\begin{itemize}\n\\item a", 3)

    expect(match).toEqual({
      name: "itemize",
      matched: false,
      open: "\\begin{itemize}",
      close: null,
    })
  })

  it("finds nothing away from any environment", () => {
    expect(matchAt("just prose here", 5)).toBeNull()
  })

  it("pairs a verbatim environment without parsing its body", () => {
    const verbatim = "\\begin{verbatim}\n\\begin{x}\n\\end{verbatim}"

    expect(matchAt(verbatim, 3)).toEqual({
      name: "verbatim",
      matched: true,
      open: "\\begin{verbatim}",
      close: "\\end{verbatim}",
    })
  })
})

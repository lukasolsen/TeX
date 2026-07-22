import { describe, expect, it } from "vitest"

import { environmentAutoClose } from "@/features/editor/latex-auto-close-environment"

/**
 * Applies what typing `}` at the marker would produce. `source` contains a `|`
 * marking the caret, standing where the typed `}` has just landed.
 */
function typeClosingBrace(source: string): string | null {
  const position = source.indexOf("|")
  const text = source.replace("|", "")
  const edit = environmentAutoClose(text, position)
  if (edit === null) return null
  const inserted = `${text.slice(0, position)}${edit.insert}${text.slice(position)}`
  const caret = position + edit.cursor
  return `${inserted.slice(0, caret)}|${inserted.slice(caret)}`
}

describe("completing an environment as it is opened", () => {
  it("writes the matching end and puts the caret in the body", () => {
    expect(typeClosingBrace("\\begin{itemize}|")).toBe(
      "\\begin{itemize}\n\t|\n\\end{itemize}"
    )
  })

  it("keeps the indentation of the opening line", () => {
    expect(typeClosingBrace("  \\begin{center}|")).toBe(
      "  \\begin{center}\n  \t|\n  \\end{center}"
    )
  })

  it("does not close an environment that is already closed", () => {
    // Re-closing while editing an existing \begin would corrupt the document.
    expect(
      typeClosingBrace("\\begin{itemize}|\n\\item a\n\\end{itemize}")
    ).toBeNull()
  })

  it("closes an inner environment nested in an open one", () => {
    expect(
      typeClosingBrace("\\begin{figure}\n\\begin{center}|\n\\end{figure}")
    ).toBe(
      "\\begin{figure}\n\\begin{center}\n\t|\n\\end{center}\n\\end{figure}"
    )
  })

  it("does nothing for a brace that does not close an environment name", () => {
    expect(typeClosingBrace("\\section{Title}|")).toBeNull()
    expect(typeClosingBrace("plain {group}|")).toBeNull()
    expect(typeClosingBrace("\\begin{}|")).toBeNull()
  })

  it("does nothing inside a comment", () => {
    expect(typeClosingBrace("% \\begin{itemize}|")).toBeNull()
  })

  it("closes a verbatim environment too", () => {
    expect(typeClosingBrace("\\begin{verbatim}|")).toBe(
      "\\begin{verbatim}\n\t|\n\\end{verbatim}"
    )
  })
})

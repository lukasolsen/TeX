import { describe, expect, it } from "vitest"

import { documentDiagnostics } from "@/domain/latex-diagnostics"

function codes(source: string) {
  return documentDiagnostics(source).map((diagnostic) => diagnostic.code)
}

describe("document diagnostics", () => {
  it("reports an unclosed environment against its opening command", () => {
    const source = "\\begin{itemize}\n\\item a\n"
    const [diagnostic] = documentDiagnostics(source)

    expect(diagnostic?.code).toBe("unclosed-environment")
    expect(diagnostic?.severity).toBe("error")
    expect(diagnostic?.message).toBe(
      "\\begin{itemize} is never closed. Add \\end{itemize}."
    )
    expect(source.slice(diagnostic?.from, diagnostic?.to)).toBe(
      "\\begin{itemize}"
    )
  })

  it("names the missing closer for each math delimiter", () => {
    expect(documentDiagnostics("\\[ x")[0]?.message).toBe(
      "Math opened with \\[ is never closed. Add \\]."
    )
    expect(documentDiagnostics("$ x")[0]?.message).toBe(
      "Math opened with $ is never closed. Add $."
    )
  })

  it("reports a label the file defines twice, naming the first line", () => {
    const source = "\\label{sec:a}\n\ntext\n\n\\label{sec:a}\n"
    const [diagnostic] = documentDiagnostics(source)

    expect(diagnostic?.code).toBe("duplicate-label")
    expect(diagnostic?.severity).toBe("warning")
    expect(diagnostic?.message).toContain("already defined on line 1")
    expect(diagnostic?.from).toBe(source.lastIndexOf("sec:a"))
  })

  it("reports only the first unclosed brace so one mistake is one diagnostic", () => {
    expect(codes("{{{{ text")).toEqual(["unclosed-group"])
  })

  it("stays silent on a reference whose label is defined elsewhere", () => {
    expect(codes("\\ref{sec:from-another-chapter}\\cite{knuth1984}")).toEqual(
      []
    )
  })

  it("stays silent on a balanced multi-file-style document", () => {
    const source = [
      "\\documentclass{article}",
      "\\usepackage{amsmath}",
      "\\begin{document}",
      "\\section{One}\\label{sec:one}",
      "See \\cref{sec:one} and \\(x^2\\) and $y$.",
      "\\begin{align}a &= b\\end{align}",
      "\\begin{verbatim}\\begin{unclosed} $ {\\end{verbatim}",
      "\\input{chapters/two}",
      "\\end{document}",
    ].join("\n")

    expect(documentDiagnostics(source)).toEqual([])
  })

  it("does not report structure written inside a comment", () => {
    expect(codes("% \\begin{itemize} $ {\ntext\n")).toEqual([])
  })

  it("orders diagnostics by position", () => {
    const source = "\\end{a}\n\\begin{b}\n"
    const positions = documentDiagnostics(source).map(
      (diagnostic) => diagnostic.from
    )

    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})

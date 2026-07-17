import { describe, expect, it } from "vitest"

import type { LatexCompletionItem } from "@/domain/latex-completion"
import {
  isLatexCompletionContext,
  latexCompletionKindLabel,
  latexCompletionOption,
  latexCompletionSourceSummary,
  latexInsertionPreview,
} from "@/features/editor/latex-completion"

describe("LaTeX completion source", () => {
  it("does not request completions while writing prose", () => {
    expect(isLatexCompletionContext("A normal sentence", 17)).toBe(false)
  })

  it("recognizes commands and environment names", () => {
    expect(isLatexCompletionContext("\\beg", 4)).toBe(true)
    expect(isLatexCompletionContext("\\begin{fig", 10)).toBe(true)
  })

  it("does not request completions inside a comment", () => {
    expect(isLatexCompletionContext("% \\section", 10)).toBe(false)
  })

  it("requests completions inside a mandatory argument", () => {
    expect(isLatexCompletionContext("\\ref{sec", 8)).toBe(true)
    expect(isLatexCompletionContext("\\ref{", 5)).toBe(true)
    expect(isLatexCompletionContext("\\cite{a, b, cu", 14)).toBe(true)
    expect(isLatexCompletionContext("\\includegraphics[width=5cm]{fi", 30)).toBe(true)
  })

  it("does not request completions after an argument closes", () => {
    expect(isLatexCompletionContext("\\ref{sec} ", 10)).toBe(false)
  })
})

describe("LaTeX completion presentation", () => {
  it("names each kind in plain language", () => {
    expect(latexCompletionKindLabel("command")).toBe("Command")
    expect(latexCompletionKindLabel("environment")).toBe("Environment")
    expect(latexCompletionKindLabel("snippet")).toBe("Template")
    expect(latexCompletionKindLabel("unknown")).toBeNull()
  })

  it("explains where a suggestion comes from without jargon", () => {
    expect(
      latexCompletionSourceSummary({ provenance: "core", requires: null })
    ).toBe("Built into LaTeX")
    expect(
      latexCompletionSourceSummary({ provenance: "local", requires: null })
    ).toBe("Defined in this project")
    expect(
      latexCompletionSourceSummary({ provenance: "package", requires: "amsmath" })
    ).toBe("Provided by the amsmath package")
    expect(
      latexCompletionSourceSummary({ provenance: "package", requires: null })
    ).toBe("Provided by a loaded package")
  })

  it("names the project-symbol kinds", () => {
    expect(latexCompletionKindLabel("label")).toBe("Label")
    expect(latexCompletionKindLabel("citation")).toBe("Citation")
    expect(latexCompletionKindLabel("file")).toBe("File")
  })

  it("attributes a project symbol to its defining file", () => {
    expect(
      latexCompletionSourceSummary({
        provenance: "project",
        requires: null,
        source: "intro.tex",
      })
    ).toBe("Defined in intro.tex")
    expect(
      latexCompletionSourceSummary({
        provenance: "project",
        requires: null,
        source: null,
      })
    ).toBe("A file in this project")
  })

  it("previews multi-line insertions with readable placeholders", () => {
    expect(latexInsertionPreview("\\section")).toBeNull()
    expect(
      latexInsertionPreview("\\begin{figure}\n  \\caption{${caption}}\n\\end{figure}")
    ).toContain("\\caption{caption}")
  })

  it("maps a backend item to a boosted, typed option", () => {
    const item: LatexCompletionItem = {
      label: "\\section",
      detail: "Start a section.",
      kind: "command",
      provenance: "core",
      requires: null,
      from: 0,
      to: 4,
      insertText: "\\section",
      source: null,
    }
    const option = latexCompletionOption(item, 0)
    expect(option.label).toBe("\\section")
    expect(option.type).toBe("command")
    expect(option.boost).toBe(99)
  })
})

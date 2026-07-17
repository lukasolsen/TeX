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

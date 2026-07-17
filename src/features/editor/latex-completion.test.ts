import { describe, expect, it } from "vitest"

import { isLatexCompletionContext } from "@/features/editor/latex-completion"

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

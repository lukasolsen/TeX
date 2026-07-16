import { describe, expect, it } from "vitest"

import { latexSemanticTokens } from "@/features/editor/latex-semantic-highlighting"

describe("LaTeX semantic highlighting", () => {
  it("distinguishes semantic argument types and project files", () => {
    const source = [
      "\\section[Short]{A clear heading}",
      "\\label{sec:intro}",
      "See \\cref{sec:intro} and \\cite{knuth1984}.",
      "\\input{chapters/introduction}",
      "\\input{chapters/missing}",
    ].join("\n")
    const tokens = latexSemanticTokens(source, {
      sourcePath: "main.tex",
      projectFiles: new Set(["main.tex", "chapters/introduction.tex"]),
    })
    const classified = tokens.map((token) => ({
      text: source.slice(token.from, token.to),
      className: token.className,
    }))

    expect(classified).toContainEqual({
      text: "Short",
      className: "cm-latex-option",
    })
    expect(classified).toContainEqual({
      text: "A clear heading",
      className: "cm-latex-heading",
    })
    expect(classified).toContainEqual({
      text: "sec:intro",
      className: "cm-latex-label-definition",
    })
    expect(classified).toContainEqual({
      text: "sec:intro",
      className: "cm-latex-label-reference",
    })
    expect(classified).toContainEqual({
      text: "knuth1984",
      className: "cm-latex-citation",
    })
    expect(classified).toContainEqual({
      text: "chapters/introduction",
      className: "cm-latex-file-reference",
    })
    expect(classified).toContainEqual({
      text: "chapters/missing",
      className: "cm-latex-file-reference cm-latex-file-missing",
    })
  })
})

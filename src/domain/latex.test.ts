import { describe, expect, it } from "vitest"

import {
  latexCommands,
  latexFileReferenceAt,
  latexFileReferences,
} from "@/domain/latex"

describe("LaTeX source parsing", () => {
  it("parses nested groups and ignores commented commands", () => {
    const source = "% \\input{ignored}\n\\section[Short]{A {nested} title}"

    expect(latexCommands(source)).toMatchObject([
      {
        name: "section",
        groups: [
          { value: "Short", kind: "optional" },
          { value: "A {nested} title", kind: "required" },
        ],
      },
    ])
  })

  it("resolves comma-separated and parent-relative file references", () => {
    const source = "\\bibliography{../shared/core, local}"

    expect(latexFileReferences(source, "chapters/method.tex")).toMatchObject([
      { path: "shared/core.bib", command: "bibliography" },
      { path: "chapters/local.bib", command: "bibliography" },
    ])
  })

  it("only selects positions inside the reference text", () => {
    const source = "\\input{chapter}"

    expect(
      latexFileReferenceAt(source, "main.tex", source.indexOf("chapter"))
    ).toMatchObject({ path: "chapter.tex" })
    expect(
      latexFileReferenceAt(source, "main.tex", source.indexOf("}"))
    ).toBeNull()
  })

  it("recognizes file arguments that follow a directory or language group", () => {
    const source = [
      "\\subimport{appendices/}{proof}",
      "\\inputminted{rust}{examples/main.rs}",
    ].join("\n")

    expect(latexFileReferences(source, "main.tex")).toMatchObject([
      { path: "appendices/proof.tex", command: "subimport" },
      { path: "examples/main.rs", command: "inputminted" },
    ])
  })
})

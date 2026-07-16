import { describe, expect, it } from "vitest"

import {
  latexCommands,
  latexFileReferenceAt,
  latexFileReferences,
  latexFileReferencesFromCommands,
} from "@/domain/latex"
import { projectRelativePath } from "@/domain/identifiers"

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

    expect(
      latexFileReferences(source, projectRelativePath("chapters/method.tex"))
    ).toMatchObject([
      { path: "shared/core.bib", command: "bibliography" },
      { path: "chapters/local.bib", command: "bibliography" },
    ])
  })

  it("only selects positions inside the reference text", () => {
    const source = "\\input{chapter}"

    expect(
      latexFileReferenceAt(
        source,
        projectRelativePath("main.tex"),
        source.indexOf("chapter")
      )
    ).toMatchObject({ path: "chapter.tex" })
    expect(
      latexFileReferenceAt(
        source,
        projectRelativePath("main.tex"),
        source.indexOf("}")
      )
    ).toBeNull()
  })

  it("recognizes file arguments that follow a directory or language group", () => {
    const source = [
      "\\subimport{appendices/}{proof}",
      "\\inputminted{rust}{examples/main.rs}",
    ].join("\n")

    expect(
      latexFileReferences(source, projectRelativePath("main.tex"))
    ).toMatchObject([
      { path: "appendices/proof.tex", command: "subimport" },
      { path: "examples/main.rs", command: "inputminted" },
    ])
  })

  it("resolves pre-parsed commands without changing reference semantics", () => {
    const source = "\\input{chapter}\n\\addbibresource{references.bib}"
    const sourcePath = projectRelativePath("main.tex")

    expect(
      latexFileReferencesFromCommands(latexCommands(source), sourcePath)
    ).toEqual(latexFileReferences(source, sourcePath))
  })
})

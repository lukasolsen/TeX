import { Text } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { projectRelativePath } from "@/domain/identifiers"
import type { LatexSymbolInfo } from "@/domain/latex-analysis"
import {
  navigationTargetAt,
  unresolvedSymbolMessage,
} from "@/features/editor/latex-navigation"
import { latexSymbolDocumentation } from "@/features/editor/latex-symbol-hover"

const main = projectRelativePath("chapters/one.tex")
const present = new Set([projectRelativePath("chapters/intro.tex")])
const exists = (path: string) => present.has(projectRelativePath(path))

function targetIn(source: string, needle: string) {
  return navigationTargetAt(
    Text.of(source.split("\n")),
    main,
    source.indexOf(needle),
    exists
  )
}

describe("what a jump targets", () => {
  it("targets a label reference by name", () => {
    expect(targetIn("see \\ref{sec:intro} now", "sec:intro")).toMatchObject({
      kind: "symbol",
      name: "sec:intro",
      role: "label-reference",
    })
  })

  it("targets a citation key by name", () => {
    expect(targetIn("\\cite{a, knuth1984}", "knuth1984")).toMatchObject({
      kind: "symbol",
      name: "knuth1984",
      role: "citation-reference",
    })
  })

  it("targets an existing file relative to the including file", () => {
    expect(targetIn("\\input{intro}", "intro}")).toMatchObject({
      kind: "file",
      path: "chapters/intro.tex",
    })
  })

  it("does not invite a click on a file the project does not contain", () => {
    expect(targetIn("\\input{ghost}", "ghost")).toBeNull()
  })

  it("does not target a label definition, which is already the definition", () => {
    expect(targetIn("\\label{sec:intro}", "sec:intro")).toBeNull()
  })

  it("targets nothing in ordinary prose", () => {
    expect(targetIn("just some words", "some")).toBeNull()
  })

  it("targets nothing inside a comment", () => {
    expect(targetIn("% \\ref{sec:intro}", "sec:intro")).toBeNull()
  })

  it("names the symbol kind when a jump cannot resolve", () => {
    expect(
      unresolvedSymbolMessage({ name: "k", role: "citation-reference" })
    ).toBe("No bibliography entry named k exists in this project")
    expect(
      unresolvedSymbolMessage({ name: "s", role: "label-reference" })
    ).toBe("No \\label{s} is defined in this project")
  })
})

describe("cross-reference hover", () => {
  const symbol: LatexSymbolInfo = {
    name: "sec:intro",
    kind: "label",
    definitions: [
      {
        path: projectRelativePath("chapters/intro.tex"),
        span: { line: 12, column: 20, endLine: 12, endColumn: 29 },
        preview: "\\section{Introduction}\\label{sec:intro}",
      },
    ],
    references: [
      {
        path: projectRelativePath("main.tex"),
        span: { line: 4, column: 6, endLine: 4, endColumn: 15 },
        preview: "See \\ref{sec:intro}.",
      },
    ],
  }

  it("says where the definition is and shows its line", () => {
    const card = latexSymbolDocumentation(symbol)

    expect(card?.title).toBe("sec:intro")
    expect(card?.markdown).toContain("line 12")
    expect(card?.markdown).toContain("chapters/intro.tex")
    expect(card?.markdown).toContain("\\section{Introduction}")
  })

  it("counts the uses elsewhere in the project", () => {
    expect(latexSymbolDocumentation(symbol)?.markdown).toContain("Used once")
  })

  it("warns when a symbol is defined more than once", () => {
    const duplicated: LatexSymbolInfo = {
      ...symbol,
      definitions: [...symbol.definitions, ...symbol.definitions],
    }

    expect(latexSymbolDocumentation(duplicated)?.markdown).toContain(
      "Defined in 2 places"
    )
  })

  it("stays silent for a symbol the project does not define", () => {
    // The diagnostic on that span already says so; repeating it adds nothing.
    expect(latexSymbolDocumentation({ ...symbol, definitions: [] })).toBeNull()
  })

  it("names a bibliography entry as one", () => {
    expect(
      latexSymbolDocumentation({ ...symbol, kind: "citation" })?.markdown
    ).toContain("Bibliography entry")
  })
})

import { describe, expect, it } from "vitest"

import { documentOutline } from "@/features/projects/document-outline"

describe("documentOutline", () => {
  it("extracts section levels and source lines", () => {
    expect(
      documentOutline(
        [
          "\\chapter{Method}",
          "text",
          "\\section[Short]{Detailed results}",
          "\\subsection*{Limitations}",
        ].join("\n")
      )
    ).toEqual([
      { command: "chapter", level: 1, line: 1, title: "Method" },
      { command: "section", level: 2, line: 3, title: "Detailed results" },
      { command: "subsection", level: 3, line: 4, title: "Limitations" },
    ])
  })

  it("ignores comments and simplifies common formatting commands", () => {
    expect(
      documentOutline(
        "% \\section{Hidden}\n\\section{An \\textbf{important} result} % note"
      )
    ).toEqual([
      {
        command: "section",
        level: 2,
        line: 2,
        title: "An important result",
      },
    ])
  })

  it("keeps escaped percent signs in titles", () => {
    expect(documentOutline("\\section{A 95\\% interval}")[0]).toMatchObject({
      title: "A 95% interval",
    })
  })
})

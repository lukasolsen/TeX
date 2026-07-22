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

  it("ignores a heading inside a verbatim body", () => {
    // The old line-based scan could not see environments, so a heading shown
    // as example code appeared in the outline as if it were real.
    expect(
      documentOutline(
        [
          "\\section{Real}",
          "\\begin{verbatim}",
          "\\section{Example}",
          "\\end{verbatim}",
        ].join("\n")
      ).map((item) => item.title)
    ).toEqual(["Real"])
  })

  it("ignores a heading inside an inline verb argument", () => {
    expect(documentOutline("Write \\verb|\\section{Example}| inline.")).toEqual(
      []
    )
  })

  it("reads a heading whose title spans lines", () => {
    expect(
      documentOutline("\\section{A title\n  over two lines}")
    ).toMatchObject([{ line: 1, title: "A title over two lines" }])
  })

  it("numbers lines correctly after a multi-line heading", () => {
    expect(
      documentOutline("\\section{One\n  wrapped}\ntext\n\\section{Two}").map(
        (item) => [item.line, item.title]
      )
    ).toEqual([
      [1, "One wrapped"],
      [4, "Two"],
    ])
  })
})

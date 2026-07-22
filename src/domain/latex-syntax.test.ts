import { describe, expect, it } from "vitest"

import { projectRelativePath } from "@/domain/identifiers"
import {
  isLiteralPosition,
  isMathPosition,
  latexOccurrenceAt,
  latexRegionAt,
  parseLatexDocument,
  type LatexOccurrence,
  type LatexRegion,
} from "@/domain/latex-syntax"

function regionsOf(source: string, kind: LatexRegion["kind"]) {
  return parseLatexDocument(source)
    .regions.filter((region) => region.kind === kind)
    .map((region) => ({
      name: region.name,
      text: source.slice(region.from, region.to),
      closed: region.closed,
    }))
}

function named(
  occurrences: readonly LatexOccurrence[],
  role: LatexOccurrence["role"]
) {
  return occurrences
    .filter((occurrence) => occurrence.role === role)
    .map((occurrence) => occurrence.name)
}

describe("environment structure", () => {
  it("pairs nested environments and records their bodies", () => {
    const source =
      "\\begin{figure}\n  \\begin{center}x\\end{center}\n\\end{figure}"
    const model = parseLatexDocument(source)
    const environments = model.regions.filter(
      (region) => region.kind === "environment"
    )

    expect(environments.map((region) => region.name)).toEqual([
      "figure",
      "center",
    ])
    const [figure, center] = environments
    expect(figure?.closed).toBe(true)
    expect(source.slice(figure?.bodyFrom, figure?.bodyTo)).toBe(
      "\n  \\begin{center}x\\end{center}\n"
    )
    expect(source.slice(center?.bodyFrom, center?.bodyTo)).toBe("x")
    expect(model.problems).toEqual([])
  })

  it("reports an environment that is never closed", () => {
    const model = parseLatexDocument("\\begin{itemize}\n\\item a\n")

    expect(model.problems).toEqual([
      {
        kind: "unclosed-environment",
        name: "itemize",
        from: 0,
        to: 15,
        expected: "\\end{itemize}",
      },
    ])
  })

  it("reports an end without a matching begin", () => {
    const model = parseLatexDocument("text\n\\end{itemize}\n")

    expect(model.problems.map((problem) => problem.kind)).toEqual([
      "unopened-environment",
    ])
    expect(model.problems[0]?.name).toBe("itemize")
  })

  it("blames the inner environment when a close crosses a nesting boundary", () => {
    const model = parseLatexDocument(
      "\\begin{figure}\n\\begin{center}\n\\end{figure}"
    )

    expect(
      model.problems.map((problem) => [problem.kind, problem.name])
    ).toEqual([["mismatched-environment", "center"]])
  })

  it("tolerates a starred environment name", () => {
    const model = parseLatexDocument("\\begin{align*}x\\end{align*}")

    expect(model.problems).toEqual([])
    expect(model.regions[0]?.name).toBe("align*")
  })
})

describe("math structure", () => {
  it("pairs every math delimiter form", () => {
    expect(regionsOf("a $x$ b \\(y\\) c \\[z\\] d $$w$$", "math")).toEqual([
      { name: "$", text: "$x$", closed: true },
      { name: "\\(", text: "\\(y\\)", closed: true },
      { name: "\\[", text: "\\[z\\]", closed: true },
      { name: "$$", text: "$$w$$", closed: true },
    ])
  })

  it("does not treat an escaped dollar as math", () => {
    const model = parseLatexDocument("costs \\$5 and \\$6")

    expect(model.regions).toEqual([])
    expect(model.problems).toEqual([])
  })

  it("reports an unclosed math delimiter", () => {
    const model = parseLatexDocument("start \\[ x = 1")

    expect(
      model.problems.map((problem) => [problem.kind, problem.expected])
    ).toEqual([["unclosed-math", "\\]"]])
  })

  it("answers whether a position is mathematics", () => {
    const source = "word $q$ more \\begin{align}z\\end{align} tail"
    const model = parseLatexDocument(source)

    expect(isMathPosition(model, source.indexOf("q"))).toBe(true)
    expect(isMathPosition(model, source.indexOf("more"))).toBe(false)
    expect(isMathPosition(model, source.indexOf("z"))).toBe(true)
    expect(isMathPosition(model, source.indexOf("tail"))).toBe(false)
  })
})

describe("verbatim and comments", () => {
  it("keeps a verbatim body out of the parse", () => {
    const source = "\\begin{verbatim}\n\\begin{itemize} $ % {\n\\end{verbatim}"
    const model = parseLatexDocument(source)

    expect(model.problems).toEqual([])
    expect(model.regions.map((region) => region.kind)).toEqual(["verbatim"])
  })

  it("treats an inline verb argument as literal", () => {
    const source = "use \\verb|\\begin{x} % $| then done"
    const model = parseLatexDocument(source)

    expect(model.problems).toEqual([])
    expect(isLiteralPosition(model, source.indexOf("begin"))).toBe(true)
    expect(isLiteralPosition(model, source.indexOf("done"))).toBe(false)
  })

  it("ignores structure written inside a comment", () => {
    const model = parseLatexDocument("% \\begin{itemize} $x\ntext\n")

    expect(model.problems).toEqual([])
  })

  it("groups adjacent whole-line comments into one foldable block", () => {
    const source = "% one\n% two\n\ncode\n% three\n"

    expect(regionsOf(source, "comment").map((region) => region.text)).toEqual([
      "% one\n% two",
      "% three",
    ])
  })

  it("does not fold a trailing comment on a code line", () => {
    expect(regionsOf("code % trailing\n", "comment")).toEqual([])
  })
})

describe("symbol occurrences", () => {
  it("separates label definitions from label references", () => {
    const source = "\\label{sec:a}\\ref{sec:a}\\cref{sec:a,sec:b}"
    const { occurrences } = parseLatexDocument(source)

    expect(named(occurrences, "label-definition")).toEqual(["sec:a"])
    expect(named(occurrences, "label-reference")).toEqual([
      "sec:a",
      "sec:a",
      "sec:b",
    ])
  })

  it("records each key of a citation list with its own span", () => {
    const source = "\\cite{knuth1984, lamport1994}"
    const { occurrences } = parseLatexDocument(source)
    const spans = occurrences.map((occurrence) => [
      occurrence.name,
      source.slice(occurrence.from, occurrence.to),
    ])

    expect(spans).toEqual([
      ["knuth1984", "knuth1984"],
      ["lamport1994", "lamport1994"],
    ])
  })

  it("takes the final required group of a biblatex multi-cite", () => {
    const { occurrences } = parseLatexDocument("\\textcite[see][12]{knuth1984}")

    expect(named(occurrences, "citation-reference")).toEqual(["knuth1984"])
  })

  it("reads a bibitem key past its optional label", () => {
    const { occurrences } = parseLatexDocument("\\bibitem[LT94]{lamport1994}")

    expect(named(occurrences, "citation-definition")).toEqual(["lamport1994"])
  })

  it("records packages, classes, and local definitions", () => {
    const source = [
      "\\documentclass[11pt]{article}",
      "\\usepackage{amsmath, graphicx}",
      "\\newcommand{\\vect}[1]{\\mathbf{#1}}",
      "\\DeclareMathOperator\\spann{span}",
      "\\newenvironment{note}{}{}",
    ].join("\n")
    const { occurrences } = parseLatexDocument(source)

    expect(named(occurrences, "document-class")).toEqual(["article"])
    expect(named(occurrences, "package")).toEqual(["amsmath", "graphicx"])
    expect(named(occurrences, "macro-definition")).toEqual(["vect", "spann"])
    expect(named(occurrences, "environment-definition")).toEqual(["note"])
  })

  it("resolves file references relative to the parsed file", () => {
    const source = "\\input{intro}\\includegraphics{figures/plot.png}"
    const { occurrences } = parseLatexDocument(
      source,
      projectRelativePath("chapters/one.tex")
    )

    expect(
      occurrences.map((occurrence) => [occurrence.name, occurrence.path])
    ).toEqual([
      ["intro", "chapters/intro.tex"],
      ["figures/plot.png", "chapters/figures/plot.png"],
    ])
  })

  it("does not record symbols written inside a comment or verbatim body", () => {
    const source = [
      "% \\label{commented}",
      "\\begin{verbatim}",
      "\\label{verbatim}",
      "\\end{verbatim}",
      "\\label{real}",
    ].join("\n")
    const { occurrences } = parseLatexDocument(source)

    expect(named(occurrences, "label-definition")).toEqual(["real"])
  })

  it("finds the occurrence under a position", () => {
    const source = "see \\ref{sec:intro} now"
    const model = parseLatexDocument(source)

    expect(latexOccurrenceAt(model, source.indexOf("sec:intro"))?.name).toBe(
      "sec:intro"
    )
    expect(latexOccurrenceAt(model, source.indexOf("now"))).toBeNull()
  })
})

describe("bounds and resilience", () => {
  it("finds the innermost region containing a position", () => {
    const source = "\\begin{figure}\\begin{center}x\\end{center}\\end{figure}"
    const model = parseLatexDocument(source)

    expect(latexRegionAt(model, source.indexOf("x"))?.name).toBe("center")
  })

  it("terminates on deeply unbalanced input", () => {
    const model = parseLatexDocument("{".repeat(5_000))

    expect(model.problems.length).toBeGreaterThan(0)
    expect(
      model.problems.every((problem) => problem.kind === "unclosed-group")
    ).toBe(true)
  })

  it("opens no environment when its name is never terminated", () => {
    const model = parseLatexDocument(`\\begin{${"x".repeat(500)}`)

    expect(model.regions).toEqual([])
    expect(model.problems.map((problem) => problem.kind)).toEqual([
      "unclosed-group",
    ])
  })

  it("parses a large document within a linear budget", () => {
    const unit = "\\begin{itemize}\\item $x^2$ \\label{a}\\end{itemize}\n"
    const model = parseLatexDocument(unit.repeat(2_000))

    expect(model.problems).toEqual([])
    expect(model.truncated).toBe(false)
  })
})

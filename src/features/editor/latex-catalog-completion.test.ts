// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import { latexCompletionContextAt } from "@/domain/latex-completion-context"
import {
  catalogSummary,
  latexCatalogOptions,
} from "@/features/editor/latex-catalog-completion"

function optionsAtEnd(source: string) {
  const context = latexCompletionContextAt(source, source.length)
  if (context === null) throw new Error("expected a completion context")
  return latexCatalogOptions(context)
}

function labels(source: string): string[] {
  return optionsAtEnd(source).map((option) => option.label)
}

describe("catalog completions", () => {
  it("offers commands far beyond the project index's own list", () => {
    const commands = labels("\\se")

    expect(commands.length).toBeGreaterThan(200)
    expect(commands).toContain("\\section")
    expect(commands).toContain("\\bfseries")
  })

  it("returns the whole catalog so the editor can match beyond a prefix", () => {
    // `\bfsr` should be able to find `\bfseries`, which is only possible if the
    // option is present for CodeMirror's matcher to score.
    expect(labels("\\bfsr")).toContain("\\bfseries")
  })

  it("offers packages inside a package argument", () => {
    const packages = labels("\\usepackage{ams")

    expect(packages).toContain("amsmath")
    expect(packages).not.toContain("\\section")
  })

  it("offers document classes inside a class argument", () => {
    expect(labels("\\documentclass{art")).toContain("article")
  })

  it("leaves environment and symbol arguments to the project index", () => {
    expect(
      latexCatalogOptions({
        kind: "environment",
        from: 0,
        prefix: "",
        closing: false,
      })
    ).toEqual([])
    expect(
      latexCatalogOptions({
        kind: "argument",
        command: "ref",
        from: 0,
        prefix: "",
      })
    ).toEqual([])
  })

  it("ranks below project suggestions", () => {
    for (const option of optionsAtEnd("\\se")) {
      expect(option.boost).toBeLessThan(0)
    }
  })

  it("carries documentation for every option", () => {
    const section = optionsAtEnd("\\se").find(
      (option) => option.label === "\\section"
    )

    expect(section?.detail).not.toBe("")
    expect(typeof section?.info).toBe("function")
  })

  it("summarises an entry as one plain sentence", () => {
    expect(
      catalogSummary(
        "Starts a **numbered** section. See `\\subsection` for the level below.\n\nMore detail."
      )
    ).toBe("Starts a numbered section.")
  })

  it("summarises an entry with no sentence break without truncating oddly", () => {
    expect(catalogSummary("A single clause with no period")).toBe(
      "A single clause with no period"
    )
  })
})

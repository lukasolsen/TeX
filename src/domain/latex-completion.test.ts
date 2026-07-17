import { describe, expect, it } from "vitest"

import { parseLatexCompletionResponse } from "@/domain/latex-completion"

describe("LaTeX completion contract", () => {
  it("parses a command completion with a snippet insertion", () => {
    expect(
      parseLatexCompletionResponse({
        items: [
          {
            label: "\\section",
            detail: "Section heading.",
            kind: "command",
            provenance: "core",
            requires: null,
            from: 1,
            to: 5,
            insertText: "\\section{${title}}",
          },
        ],
      })
    ).toMatchObject({
      items: [{ kind: "command", provenance: "core", requires: null }],
    })
  })

  it("parses the package a completion requires", () => {
    expect(
      parseLatexCompletionResponse({
        items: [
          {
            label: "align",
            detail: "Aligned display equations.",
            kind: "environment",
            provenance: "package",
            requires: "amsmath",
            from: 0,
            to: 3,
            insertText: "align",
          },
        ],
      })
    ).toMatchObject({ items: [{ requires: "amsmath" }] })
  })

  it("rejects a completion with an unknown provenance", () => {
    expect(() =>
      parseLatexCompletionResponse({
        items: [
          {
            label: "x",
            detail: "x",
            kind: "command",
            provenance: "invented",
            requires: null,
            from: 0,
            to: 1,
            insertText: "x",
          },
        ],
      })
    ).toThrow("TeX rejected an invalid LaTeX completion provenance response.")
  })

  it("parses a project label with its defining file", () => {
    expect(
      parseLatexCompletionResponse({
        items: [
          {
            label: "sec:intro",
            detail: "Cross-reference label.",
            kind: "label",
            provenance: "project",
            requires: null,
            source: "intro.tex",
            from: 5,
            to: 8,
            insertText: "sec:intro",
          },
        ],
      })
    ).toMatchObject({
      items: [{ kind: "label", provenance: "project", source: "intro.tex" }],
    })
  })

  it("parses a file suggestion with no defining source", () => {
    expect(
      parseLatexCompletionResponse({
        items: [
          {
            label: "figures/plot.png",
            detail: "Project file.",
            kind: "file",
            provenance: "project",
            requires: null,
            source: null,
            from: 0,
            to: 2,
            insertText: "figures/plot.png",
          },
        ],
      })
    ).toMatchObject({ items: [{ kind: "file", source: null }] })
  })

  it("rejects a completion with an unknown kind", () => {
    expect(() =>
      parseLatexCompletionResponse({
        items: [
          {
            label: "x",
            detail: "x",
            kind: "gremlin",
            provenance: "core",
            requires: null,
            source: null,
            from: 0,
            to: 1,
            insertText: "x",
          },
        ],
      })
    ).toThrow("TeX rejected an invalid LaTeX completion kind response.")
  })
})

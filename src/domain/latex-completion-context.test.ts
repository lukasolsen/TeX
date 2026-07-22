import { describe, expect, it } from "vitest"

import { latexCompletionContextAt } from "@/domain/latex-completion-context"

/** The context at the end of `source`, which is where the cursor would be. */
function contextAtEnd(source: string) {
  return latexCompletionContextAt(source, source.length)
}

describe("what the cursor is completing", () => {
  it("recognises a command prefix", () => {
    expect(contextAtEnd("Text \\sec")).toEqual({
      kind: "command",
      from: 5,
      prefix: "sec",
    })
  })

  it("recognises a bare backslash as an empty command prefix", () => {
    expect(contextAtEnd("Text \\")).toEqual({
      kind: "command",
      from: 5,
      prefix: "",
    })
  })

  it("distinguishes opening from closing an environment", () => {
    expect(contextAtEnd("\\begin{fig")).toMatchObject({
      kind: "environment",
      prefix: "fig",
      closing: false,
    })
    expect(contextAtEnd("\\end{ite")).toMatchObject({
      kind: "environment",
      prefix: "ite",
      closing: true,
    })
  })

  it("recognises package and class arguments", () => {
    expect(contextAtEnd("\\usepackage{amsm")).toMatchObject({
      kind: "package",
      prefix: "amsm",
    })
    expect(contextAtEnd("\\RequirePackage{tik")).toMatchObject({
      kind: "package",
      prefix: "tik",
    })
    expect(contextAtEnd("\\documentclass{art")).toMatchObject({
      kind: "document-class",
      prefix: "art",
    })
  })

  it("completes the final entry of a comma-separated list", () => {
    const source = "\\usepackage{amsmath, graph"
    expect(contextAtEnd(source)).toEqual({
      kind: "package",
      from: source.length - 5,
      prefix: "graph",
    })
  })

  it("reads an argument past an optional group", () => {
    expect(contextAtEnd("\\includegraphics[width=5cm]{fi")).toMatchObject({
      kind: "argument",
      command: "includegraphics",
      prefix: "fi",
    })
  })

  it("reads an argument of a starred command", () => {
    expect(contextAtEnd("\\section*{Ti")).toMatchObject({
      kind: "argument",
      command: "section",
      prefix: "Ti",
    })
  })

  it("treats an empty argument as a blank prefix", () => {
    expect(contextAtEnd("\\ref{")).toEqual({
      kind: "argument",
      command: "ref",
      from: 5,
      prefix: "",
    })
  })

  it("offers nothing once an argument has closed", () => {
    expect(contextAtEnd("\\ref{sec} ")).toBeNull()
  })

  it("offers nothing in ordinary prose", () => {
    expect(contextAtEnd("ordinary words")).toBeNull()
  })

  it("offers nothing inside a comment", () => {
    expect(contextAtEnd("% \\sec")).toBeNull()
    expect(contextAtEnd("% \\ref{se")).toBeNull()
  })

  it("still completes after an escaped percent on the same line", () => {
    expect(contextAtEnd("100\\% then \\sec")).toMatchObject({
      kind: "command",
      prefix: "sec",
    })
  })

  it("offers nothing after an escaped backslash", () => {
    // `\\` is a line break, so the following text is not a command name.
    expect(contextAtEnd("line \\\\")).toBeNull()
  })

  it("takes the innermost group when they nest", () => {
    expect(contextAtEnd("\\caption{See \\ref{fi")).toMatchObject({
      kind: "argument",
      command: "ref",
      prefix: "fi",
    })
  })
})

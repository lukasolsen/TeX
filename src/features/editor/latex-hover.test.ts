import { describe, expect, it } from "vitest"

import { keywordAt, referencedFileAt } from "@/features/editor/latex-hover"

describe("keywordAt", () => {
  it("recognizes a command from every hover position", () => {
    const source = "\\documentclass{article}"
    const positions = [
      source.indexOf("\\"),
      source.indexOf("d"),
      source.indexOf("u"),
      source.indexOf("s"),
    ]

    for (const position of positions) {
      expect(keywordAt(source, position)?.info.title).toBe("\\documentclass")
    }
  })

  it("resolves input references to their project-relative source files", () => {
    const source = "\\input{chapters/introduction}"
    const position = source.indexOf("introduction")

    expect(referencedFileAt(source, "main.tex", position)).toMatchObject({
      path: "chapters/introduction.tex",
      command: "input",
    })
  })
})

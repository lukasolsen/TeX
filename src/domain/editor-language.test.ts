import { describe, expect, it } from "vitest"

import {
  editorLanguage,
  editorLanguageName,
  hasLatexAnalysis,
} from "@/domain/editor-language"

describe("editorLanguage", () => {
  it("reads LaTeX sources and the files the engine generates as LaTeX", () => {
    expect(editorLanguage("chapters/intro.TEX")).toBe("latex")
    expect(editorLanguage("thesis.cls")).toBe("latex")
    expect(editorLanguage("build/main.toc")).toBe("latex")
  })

  it("recognises the other languages a project carries", () => {
    expect(editorLanguage("refs.bib")).toBe("bibtex")
    expect(editorLanguage("README.md")).toBe("markdown")
    expect(editorLanguage("data/table.json")).toBe("json")
    expect(editorLanguage(".latexmkrc")).toBe("perl")
    expect(editorLanguage("Makefile")).toBe("makefile")
  })

  it("falls back to plain text rather than guessing", () => {
    expect(editorLanguage("notes.txt")).toBe("plain")
    expect(editorLanguage("build/main.log")).toBe("plain")
    expect(editorLanguage("fonts/cmr10.pfb")).toBe("plain")
  })

  it("names every language it can report", () => {
    expect(editorLanguageName(editorLanguage("refs.bib"))).toBe("BibTeX")
    expect(editorLanguageName(editorLanguage("notes.txt"))).toBe("Plain text")
  })
})

describe("hasLatexAnalysis", () => {
  it("covers LaTeX documents and the bibliographies they cite", () => {
    expect(hasLatexAnalysis("chapters/intro.tex")).toBe(true)
    expect(hasLatexAnalysis("refs.bib")).toBe(true)
  })

  it("leaves files LaTeX analysis cannot describe alone", () => {
    expect(hasLatexAnalysis("README.md")).toBe(false)
    expect(hasLatexAnalysis("notes.txt")).toBe(false)
    // Generated LaTeX is highlighted as LaTeX but is not the author's source.
    expect(editorLanguage("main.aux")).toBe("latex")
    expect(hasLatexAnalysis("main.aux")).toBe(false)
  })
})

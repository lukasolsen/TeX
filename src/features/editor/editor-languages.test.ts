import { EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import type { EditorLanguageId } from "@/domain/editor-language"
import { canonicalProjectPath, projectRelativePath } from "@/domain/identifiers"
import {
  editorLanguageCompletions,
  editorLanguageSupport,
} from "@/features/editor/editor-languages"

const semantic = {
  sourcePath: projectRelativePath("main.tex"),
  projectFiles: new Set([projectRelativePath("main.tex")]),
}

function commentTokens(language: EditorLanguageId): unknown {
  const state = EditorState.create({
    doc: "",
    extensions: [editorLanguageSupport(language, { semantic })],
  })
  return state.languageDataAt("commentTokens", 0)[0]
}

describe("editorLanguageSupport", () => {
  it("gives each language the comment syntax its authors write", () => {
    expect(commentTokens("latex")).toEqual({ line: "%" })
    expect(commentTokens("bibtex")).toEqual({ line: "%" })
    expect(commentTokens("markdown")).toEqual({
      block: { open: "<!--", close: "-->" },
    })
  })

  it("declares comment syntax even where it has no parser", () => {
    expect(commentTokens("makefile")).toEqual({ line: "#" })
  })

  it("claims no syntax for a file it cannot describe", () => {
    expect(commentTokens("plain")).toBeUndefined()
  })
})

describe("editorLanguageCompletions", () => {
  const project = {
    projectPath: () => canonicalProjectPath("/projects/thesis"),
    relativePath: () => projectRelativePath("main.tex"),
  }

  it("answers for the languages TeX has suggestions for", () => {
    expect(editorLanguageCompletions("latex", project)).toHaveLength(1)
    expect(editorLanguageCompletions("bibtex", project)).toHaveLength(1)
  })

  it("offers nothing where a suggestion would be invented", () => {
    expect(editorLanguageCompletions("markdown", project)).toEqual([])
    expect(editorLanguageCompletions("plain", project)).toEqual([])
    expect(editorLanguageCompletions("yaml", project)).toEqual([])
  })
})

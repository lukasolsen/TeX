import { StringStream } from "@codemirror/language"
import { describe, expect, it } from "vitest"

import {
  bibtexStreamParser,
  type BibtexTokenState,
} from "@/features/editor/bibtex-stream-parser"

type Token = Readonly<{ text: string; tag: string | null }>

/**
 * Tokenizes whole lines the way `StreamLanguage` does, carrying state across
 * line boundaries so mode tracking is exercised rather than assumed.
 */
function tokenize(lines: readonly string[]): Token[] {
  const state: BibtexTokenState = bibtexStreamParser.startState?.(2) ?? {
    depth: 0,
    expect: null,
    type: null,
    valueDepth: 0,
    quoted: false,
  }
  const tokens: Token[] = []
  for (const line of lines) {
    if (line === "") continue
    const stream = new StringStream(line, 2, 2)
    while (!stream.eol()) {
      const start = stream.pos
      const tag = bibtexStreamParser.token(stream, state)
      if (stream.pos === start) {
        // A parser that consumes nothing would spin forever in the editor.
        throw new Error(`no progress at ${start} in ${JSON.stringify(line)}`)
      }
      tokens.push({ text: line.slice(start, stream.pos), tag })
    }
  }
  return tokens
}

/** The tag applied to the first token whose text is exactly `text`. */
function tagOf(lines: readonly string[], text: string): string | null {
  const token = tokenize(lines).find((candidate) => candidate.text === text)
  if (token === undefined) throw new Error(`no token ${JSON.stringify(text)}`)
  return token.tag
}

const ENTRY = [
  "@article{knuth1984,",
  "  author = {Knuth, Donald E.},",
  '  title = "The {TeX}book",',
  "  year = 1984,",
  "}",
]

describe("entries", () => {
  it("separates the type, the key, and the fields", () => {
    expect(tagOf(ENTRY, "@article")).toBe("typeName")
    expect(tagOf(ENTRY, "knuth1984")).toBe("labelName")
    expect(tagOf(ENTRY, "author")).toBe("propertyName")
    expect(tagOf(ENTRY, "=")).toBe("operator")
  })

  it("reads both value delimiters as one string", () => {
    expect(tagOf(ENTRY, "Knuth, Donald E.")).toBe("string")
    expect(tagOf(ENTRY, "The {TeX}book")).toBe("string")
    expect(tagOf(ENTRY, "1984")).toBe("number")
  })

  it("keeps a comma and a percent inside a value out of the structure", () => {
    const tokens = tokenize(["@misc{k, note = {100%, done}, year = 1999}"])

    expect(tokens.some((token) => token.tag === "comment")).toBe(false)
    expect(tagOf(["@misc{k, note = {100%, done}, year = 1999}"], "1999")).toBe(
      "number"
    )
  })

  it("reads a LaTeX accent inside a value as an escape", () => {
    expect(tagOf(["@misc{k, author = {Poincar\\'e}}"], "\\'")).toBe("escape")
  })

  it("closes an entry so the text after it is outside again", () => {
    expect(tagOf([...ENTRY, "loose text"], "loose text")).toBe("comment")
  })
})

describe("what BibTeX ignores", () => {
  it("shows text between entries as ignored", () => {
    expect(
      tagOf(["Notes for a reader.", "@misc{k}"], "Notes for a reader.")
    ).toBe("comment")
  })

  it("reads a percent comment to the end of the line", () => {
    expect(tagOf(["% a note", "@misc{k}"], "% a note")).toBe("comment")
  })
})

describe("entries without a citation key", () => {
  it("reads an @string definition as a field", () => {
    expect(tagOf(['@string{tex = "TeX"}'], "tex")).toBe("propertyName")
  })

  it("reads an @preamble body as a value", () => {
    expect(tagOf(['@preamble{"\\newcommand{\\x}{y}"}'], "\\newcommand")).toBe(
      "escape"
    )
  })

  it("reads an abbreviation used as a value as a name", () => {
    expect(tagOf(["@misc{k, journal = tex # jan}"], "tex")).toBe("variableName")
    expect(tagOf(["@misc{k, journal = tex # jan}"], "#")).toBe("operator")
  })
})

describe("robustness", () => {
  it("always advances, whatever the line holds", () => {
    const lines = [
      "@",
      "@article",
      "@article{",
      "{}",
      '"',
      "%",
      "=",
      "#",
      ",",
      "}",
      "@ARTICLE(x,",
      'note = "unclosed',
      "\\",
      "))",
    ]

    expect(() => tokenize(lines)).not.toThrow()
  })
})

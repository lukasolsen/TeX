import { StringStream } from "@codemirror/language"
import { describe, expect, it } from "vitest"

import {
  latexStreamParser,
  type LatexTokenState,
} from "@/features/editor/latex-stream-parser"

type Token = Readonly<{ text: string; tag: string | null }>

/**
 * Tokenizes whole lines the way `StreamLanguage` does, carrying state across
 * line boundaries so mode tracking is exercised rather than assumed.
 */
function tokenize(lines: readonly string[]): Token[] {
  const state: LatexTokenState = latexStreamParser.startState?.(2) ?? {
    math: [],
    mathEnvironments: [],
    verbatim: null,
    inlineVerbatim: null,
    expecting: null,
  }
  const tokens: Token[] = []
  for (const line of lines) {
    const stream = new StringStream(line, 2, 2)
    if (line === "") continue
    while (!stream.eol()) {
      const start = stream.pos
      const tag = latexStreamParser.token(stream, state)
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

describe("commands, comments, and escapes", () => {
  it("tags a command and its braces", () => {
    expect(tagOf(["\\section{Title}"], "\\section")).toBe("tagName")
    expect(tagOf(["\\section{Title}"], "{")).toBe("bracket")
  })

  it("tags a comment to the end of the line", () => {
    expect(tagOf(["text % a note"], "% a note")).toBe("comment")
  })

  it("does not start a comment at an escaped percent", () => {
    const tokens = tokenize(["100\\% done"])

    expect(tagOf(["100\\% done"], "\\%")).toBe("escape")
    expect(tokens.some((token) => token.tag === "comment")).toBe(false)
  })

  it("tags a macro parameter", () => {
    expect(tagOf(["\\newcommand{\\v}[1]{#1}"], "#1")).toBe("meta")
  })

  it("tags a line break separately from an escape", () => {
    expect(tagOf(["a \\\\ b"], "\\\\")).toBe("keyword")
  })
})

describe("mathematics", () => {
  it("tags inline math content as mathematics and leaves prose alone", () => {
    const lines = ["prose $x + 1$ prose"]

    expect(tagOf(lines, "$")).toBe("keyword")
    expect(tagOf(lines, "x")).toBe("variableName.special")
    expect(tagOf(lines, "prose ")).toBeNull()
  })

  it("does not open math at an escaped dollar", () => {
    const tokens = tokenize(["costs \\$5 and \\$6 each"])

    expect(tokens.some((token) => token.tag === "variableName.special")).toBe(
      false
    )
  })

  it("treats every display delimiter as math", () => {
    expect(tagOf(["\\[ y \\]"], "y")).toBe("variableName.special")
    expect(tagOf(["\\( z \\)"], "z")).toBe("variableName.special")
    expect(tagOf(["$$ w $$"], "w")).toBe("variableName.special")
  })

  it("treats a math environment body as mathematics across lines", () => {
    const lines = ["\\begin{align}", "  a &= b", "\\end{align}", "after"]

    expect(tagOf(lines, "a")).toBe("variableName.special")
    // The state must close again, so prose after the environment is prose.
    expect(tagOf(lines, "after")).toBeNull()
  })

  it("tags subscript and superscript operators inside math", () => {
    expect(tagOf(["$x^2_i$"], "^")).toBe("keyword")
    expect(tagOf(["$x^2_i$"], "_")).toBe("keyword")
  })

  it("keeps a command inside math tagged as a command", () => {
    expect(tagOf(["$\\alpha + 1$"], "\\alpha")).toBe("tagName")
  })
})

describe("verbatim", () => {
  it("reproduces a verbatim body without reading it as LaTeX", () => {
    const lines = [
      "\\begin{verbatim}",
      "  % not a comment $ not math \\begin{x}",
      "\\end{verbatim}",
      "after",
    ]
    const tokens = tokenize(lines)

    expect(tokens.some((token) => token.tag === "comment")).toBe(false)
    expect(tokens.some((token) => token.tag === "variableName.special")).toBe(
      false
    )
    expect(
      tokens
        .filter((token) => token.tag === "string")
        .some((token) => token.text.includes("not a comment"))
    ).toBe(true)
    expect(tagOf(lines, "after")).toBeNull()
  })

  it("ends a verbatim body at its own closing command only", () => {
    const lines = ["\\begin{lstlisting}", "\\end{other}", "\\end{lstlisting}"]
    const tokens = tokenize(lines)

    expect(
      tokens
        .filter((token) => token.tag === "string")
        .some((token) => token.text.includes("\\end{other}"))
    ).toBe(true)
  })

  it("treats an inline verb argument as literal text", () => {
    const lines = ["use \\verb|$ % \\x| after"]

    expect(tagOf(lines, "$ % \\x|")).toBe("string")
    expect(tagOf(lines, "\\verb")).toBe("tagName")
  })

  it("does not carry an inline verb argument past its line", () => {
    const lines = ["\\verb|unclosed", "% a real comment"]

    expect(tagOf(lines, "% a real comment")).toBe("comment")
  })
})

describe("resilience", () => {
  it("never reports a token as invalid", () => {
    const tokens = tokenize([
      "\\begin{itemize} \\item ~ & # $ ] } \\@weird",
      "}}}] $$ \\( \\]",
    ])

    expect(tokens.some((token) => token.tag === "invalid")).toBe(false)
  })

  it("always consumes at least one character", () => {
    // tokenize() throws when the parser stalls; these are the shapes most
    // likely to make it.
    expect(() =>
      tokenize(["\\", "$", "{", "\\begin{", "\\verb", "#", "&", "^", "_"])
    ).not.toThrow()
  })

  it("makes progress on every prefix of a document being typed", () => {
    // A stall is a hang, not a mis-colour, so the property is checked against
    // every intermediate state a user passes through while typing.
    const document = [
      "\\documentclass{article}",
      "\\begin{document}",
      "\\section{One}\\label{s:1}",
      "Text with $x^2$ and \\verb|raw| and 100\\%.",
      "\\begin{align}a &= b\\end{align}",
      "\\begin{verbatim}% $ \\end{verbatim}",
      "\\end{document}",
    ].join("\n")

    for (let length = 1; length <= document.length; length += 1) {
      const prefix = document.slice(0, length)
      expect(() => tokenize(prefix.split("\n"))).not.toThrow()
    }
  })
})

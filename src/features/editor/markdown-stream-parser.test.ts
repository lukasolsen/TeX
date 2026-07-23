import { StringStream } from "@codemirror/language"
import { describe, expect, it } from "vitest"

import {
  markdownStreamParser,
  type MarkdownTokenState,
} from "@/features/editor/markdown-stream-parser"

type Token = Readonly<{ text: string; tag: string | null }>

/**
 * Tokenizes whole lines the way `StreamLanguage` does, carrying state across
 * line boundaries so mode tracking is exercised rather than assumed.
 */
function tokenize(lines: readonly string[]): Token[] {
  const state: MarkdownTokenState = markdownStreamParser.startState?.(2) ?? {
    fence: null,
    frontMatter: false,
    displayMath: false,
    htmlComment: false,
    paragraph: false,
    linkTarget: false,
    table: false,
    line: 0,
  }
  const tokens: Token[] = []
  for (const line of lines) {
    if (line === "") {
      markdownStreamParser.blankLine?.(state, 2)
      continue
    }
    const stream = new StringStream(line, 2, 2)
    while (!stream.eol()) {
      const start = stream.pos
      const tag = markdownStreamParser.token(stream, state)
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

describe("blocks", () => {
  it("tags a heading by its depth", () => {
    expect(tagOf(["# Title"], "# Title")).toBe("heading1")
    expect(tagOf(["### Third"], "### Third")).toBe("heading3")
  })

  it("does not read a hash inside a word as a heading", () => {
    expect(tagOf(["issue #4 is open"], "issue")).toBeNull()
  })

  it("tags an underlined heading", () => {
    expect(tagOf(["Title", "====="], "=====")).toBe("heading1")
    expect(tagOf(["Title", "-----"], "-----")).toBe("heading2")
  })

  it("tags a thematic break that follows nothing", () => {
    expect(tagOf(["intro", "", "---"], "---")).toBe("contentSeparator")
  })

  it("tags list and quote markers", () => {
    expect(tagOf(["- item"], "- ")).toBe("list")
    expect(tagOf(["3. item"], "3. ")).toBe("list")
    expect(tagOf(["> quoted"], "> ")).toBe("quote")
  })

  it("tags front matter at the top of the file", () => {
    const lines = ["---", "title: Notes", "---", "text"]

    expect(tagOf(lines, "---")).toBe("processingInstruction")
    expect(tagOf(lines, "title")).toBe("propertyName")
  })
})

describe("code", () => {
  it("reads a fenced body as code, markup and all", () => {
    const lines = ["```sh", "# not a heading", "*not emphasis*", "```", "# yes"]

    expect(tagOf(lines, "```sh")).toBe("processingInstruction")
    expect(tagOf(lines, "# not a heading")).toBe("monospace")
    expect(tagOf(lines, "*not emphasis*")).toBe("monospace")
    expect(tagOf(lines, "# yes")).toBe("heading1")
  })

  it("reads an indented block as code only where no paragraph is running", () => {
    expect(tagOf(["", "    code()"], "    code()")).toBe("monospace")
    expect(tagOf(["text", "    still the paragraph"], "text")).toBeNull()
  })

  it("tags an inline code span", () => {
    expect(tagOf(["use `make all` first"], "`make all`")).toBe("monospace")
  })

  it("leaves an unpaired backtick as text", () => {
    expect(tagOf(["a ` b"], "`")).toBeNull()
  })
})

describe("inline markup", () => {
  it("tags strong, emphasis, and strikethrough", () => {
    expect(tagOf(["**bold** text"], "**bold**")).toBe("strong")
    expect(tagOf(["*thin* text"], "*thin*")).toBe("emphasis")
    expect(tagOf(["~~gone~~ text"], "~~gone~~")).toBe("strikethrough")
  })

  it("leaves an underscore inside a word alone", () => {
    expect(tagOf(["file_name_here"], "file")).toBeNull()
  })

  it("leaves an unpaired asterisk as text", () => {
    expect(tagOf(["2 * 3 = 6"], "*")).toBeNull()
  })

  it("tags a link and its target", () => {
    const lines = ["see [the docs](https://example.org) now"]

    expect(tagOf(lines, "[the docs]")).toBe("link")
    expect(tagOf(lines, "(https://example.org)")).toBe("url")
  })

  it("tags a bare address", () => {
    expect(tagOf(["at https://example.org today"], "https://example.org")).toBe(
      "url"
    )
  })
})

describe("mathematics", () => {
  it("tags inline mathematics", () => {
    expect(tagOf(["the value $x^2$ here"], "$x^2$")).toBe(
      "variableName.special"
    )
  })

  it("tags a display block across lines", () => {
    const lines = ["$$", "\\int_0^1 x", "$$", "after"]

    expect(tagOf(lines, "$$")).toBe("processingInstruction")
    expect(tagOf(lines, "\\int_0^1 x")).toBe("variableName.special")
    expect(tagOf(lines, "after")).toBeNull()
  })

  it("leaves a lone dollar sign as text", () => {
    expect(tagOf(["costs $5 today"], "$")).toBeNull()
  })
})

describe("HTML", () => {
  it("tags a comment across lines", () => {
    const lines = ["<!-- a note", "still a note -->", "# after"]

    expect(tagOf(lines, "<!--")).toBe("comment")
    expect(tagOf(lines, "still a note -->")).toBe("comment")
    expect(tagOf(lines, "# after")).toBe("heading1")
  })

  it("tags a tag", () => {
    expect(tagOf(["<br /> after"], "<br />")).toBe("tagName")
  })
})

describe("robustness", () => {
  it("always advances, whatever the line holds", () => {
    const lines = [
      "| a | b |",
      "| --- | --- |",
      "*",
      "_",
      "$",
      "`",
      "[x](",
      "<a",
      "~~",
      "**",
      "\\",
      "    ",
      "> - [ ] task",
      "$$x",
      "---",
      "#",
      "``` ~~~",
    ]

    expect(() => tokenize(lines)).not.toThrow()
  })
})

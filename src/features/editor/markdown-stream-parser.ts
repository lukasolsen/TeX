/**
 * A Markdown tokenizer.
 *
 * It is written for Markdown as it appears in a LaTeX project: prose with
 * headings and lists, fenced code, and mathematics. Three rules decide most of
 * what it does:
 *
 * - A fenced or indented code block is code. Nothing inside it is markup, so a
 *   `#` in a shell listing is not a heading and a `*` is not emphasis.
 * - `$…$` and `$$…$$` are mathematics, which is what an author writing
 *   Markdown next to a LaTeX document expects them to be.
 * - An inline construct that never closes on its line is not one. An unpaired
 *   `*` is an asterisk, not the start of emphasis running to the end of file.
 *
 * The parser never emits an error token: a character it does not recognise is
 * ordinary text.
 */

import type { StreamParser, StringStream } from "@codemirror/language"

export type MarkdownTokenState = {
  /** The fence marker that closes the open code block, or `null`. */
  fence: string | null
  /** True while inside the YAML front matter at the top of the file. */
  frontMatter: boolean
  /** True while a `$$` block is open. */
  displayMath: boolean
  /** True while an HTML comment is open. */
  htmlComment: boolean
  /** True when the previous line held paragraph text. */
  paragraph: boolean
  /** True once a link's `[…]` has been read and its target may follow. */
  linkTarget: boolean
  /** True while the line being read is a table row, where `|` separates cells. */
  table: boolean
  /** 1-based number of the line being read. */
  line: number
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const TABLE_DELIMITER =
  /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const QUOTE = /^ {0,3}>+[ \t]?/
const LIST = /^ {0,9}(?:[-+*]|\d{1,9}[.)])(?:[ \t]+(\[[ xX]\][ \t]+)?|$)/
const REFERENCE = /^ {0,3}\[[^\]]+\]:/
const FRONT_MATTER_KEY = /^[ \t]*[A-Za-z0-9_.-]+(?=[ \t]*:)/

/** Text is code when a fenced block is open, so nothing in it is markup. */
function closesFence(line: string, marker: string): boolean {
  const match = FENCE.exec(line)
  if (match === null) return false
  const closing = match[1] ?? ""
  return (
    closing.startsWith(marker[0] ?? "") &&
    closing.length >= marker.length &&
    (match[2] ?? "").trim() === ""
  )
}

/** Consumes the rest of the line and reports it as one token. */
function wholeLine(stream: StringStream, tag: string): string {
  stream.skipToEnd()
  return tag
}

/**
 * Block-level constructs, recognised only at the start of a line. Returns
 * `null` when the line carries no block marker and its content is inline.
 */
function blockToken(
  stream: StringStream,
  state: MarkdownTokenState
): string | null {
  const line = stream.string
  state.line += 1
  state.table = (line.match(/\|/g)?.length ?? 0) >= 2
  state.linkTarget = false

  if (state.fence !== null) {
    if (!closesFence(line, state.fence)) return wholeLine(stream, "monospace")
    state.fence = null
    return wholeLine(stream, "processingInstruction")
  }

  if (state.frontMatter) {
    if (!/^(---|\.\.\.)[ \t]*$/.test(line)) return null
    state.frontMatter = false
    return wholeLine(stream, "processingInstruction")
  }
  if (state.line === 1 && /^---[ \t]*$/.test(line)) {
    state.frontMatter = true
    return wholeLine(stream, "processingInstruction")
  }

  const fence = FENCE.exec(line)
  if (fence !== null) {
    state.fence = fence[1] ?? ""
    state.paragraph = false
    return wholeLine(stream, "processingInstruction")
  }

  const heading = ATX_HEADING.exec(line)
  if (heading !== null) {
    state.paragraph = false
    return wholeLine(stream, `heading${(heading[1] ?? "").length}`)
  }

  // A setext underline turns the paragraph above it into a heading, which
  // outranks reading `---` as a thematic break.
  const setext = SETEXT.exec(line)
  if (setext !== null && state.paragraph) {
    state.paragraph = false
    return wholeLine(
      stream,
      (setext[1] ?? "").startsWith("=") ? "heading1" : "heading2"
    )
  }
  if (THEMATIC_BREAK.test(line)) {
    state.paragraph = false
    return wholeLine(stream, "contentSeparator")
  }
  if (state.table && TABLE_DELIMITER.test(line)) {
    state.paragraph = false
    return wholeLine(stream, "punctuation")
  }

  // An indented block is code only where a paragraph is not already running,
  // which is what separates a code block from a wrapped line.
  if (!state.paragraph && /^(?: {4}|\t)/.test(line) && line.trim() !== "") {
    return wholeLine(stream, "monospace")
  }

  state.paragraph = line.trim() !== ""

  const quote = QUOTE.exec(line)
  if (quote !== null) {
    stream.pos += (quote[0] ?? "").length
    return "quote"
  }
  const list = LIST.exec(line)
  if (list !== null) {
    stream.pos += (list[0] ?? "").length
    return "list"
  }
  const reference = REFERENCE.exec(line)
  if (reference !== null) {
    stream.pos += (reference[0] ?? "").length
    state.linkTarget = true
    return "link"
  }
  return null
}

/** Inline constructs, all of which must open and close on the same line. */
function inlineToken(
  stream: StringStream,
  state: MarkdownTokenState
): string | null {
  if (state.frontMatter) {
    if (stream.peek() === "#") return wholeLine(stream, "comment")
    if (stream.match(FRONT_MATTER_KEY, true)) return "propertyName"
    if (stream.peek() === ":") {
      stream.next()
      return "punctuation"
    }
    return wholeLine(stream, "string")
  }

  if (stream.eatSpace()) return null
  const character = stream.peek()

  if (stream.match("<!--", true)) {
    state.htmlComment = true
    return "comment"
  }
  if (character === "\\" && stream.match(/^\\[^\w\s]/, true)) return "escape"
  if (stream.match("$$", true)) {
    state.displayMath = true
    return "processingInstruction"
  }
  if (character === "$") {
    const closing = stream.string.indexOf("$", stream.pos + 1)
    if (closing !== -1) {
      stream.pos = closing + 1
      return "variableName.special"
    }
  }
  if (character === "`") {
    const run = /^`+/.exec(stream.string.slice(stream.pos))?.[0] ?? "`"
    const closing = stream.string.indexOf(run, stream.pos + run.length)
    if (closing !== -1) {
      stream.pos = closing + run.length
      return "monospace"
    }
  }
  if (stream.match(/^(\*\*|__)(?!\s)[\s\S]*?\S\1/, true)) return "strong"
  if (stream.match(/^~~(?!\s)[\s\S]*?\S~~/, true)) return "strikethrough"
  // An underscore inside a word is part of the word, not a delimiter.
  if (
    (character === "*" || !/[\w]/.test(stream.string[stream.pos - 1] ?? " ")) &&
    stream.match(/^([*_])(?!\s)[^*_]*[^\s*_]\1/, true)
  ) {
    return "emphasis"
  }
  if (state.linkTarget) {
    state.linkTarget = false
    if (stream.match(/^\([^)]*\)/, true)) return "url"
    if (stream.match(/^\[[^\]]*\]/, true)) return "link"
  }
  if (stream.match(/^!?\[[^\]]*\]/, true)) {
    state.linkTarget = true
    return "link"
  }
  if (stream.match(/^<[a-zA-Z][^\s>]*:[^\s>]*>/, true)) return "url"
  if (stream.match(/^(?:https?|ftp):\/\/[^\s<>()]+/, true)) return "url"
  if (stream.match(/^<\/?[a-zA-Z][^>]*>/, true)) return "tagName"
  if (state.table && character === "|") {
    stream.next()
    return "punctuation"
  }

  // Prose advances a word at a time: a run that swallowed the whole line
  // would hide an address or a construct starting mid-line.
  if (!stream.eatWhile(/[^\s\\`*_~$[\]<>|]/)) stream.next()
  return null
}

export const markdownStreamParser: StreamParser<MarkdownTokenState> = {
  name: "markdown",

  startState: () => ({
    fence: null,
    frontMatter: false,
    displayMath: false,
    htmlComment: false,
    paragraph: false,
    linkTarget: false,
    table: false,
    line: 0,
  }),

  copyState: (state) => ({ ...state }),

  blankLine(state) {
    state.line += 1
    state.paragraph = false
    state.table = false
    state.linkTarget = false
  },

  token(stream, state) {
    if (state.htmlComment) {
      if (stream.sol()) state.line += 1
      const closing = stream.string.indexOf("-->", stream.pos)
      if (closing === -1) stream.skipToEnd()
      else {
        stream.pos = closing + 3
        state.htmlComment = false
      }
      return "comment"
    }
    if (state.displayMath) {
      if (stream.sol()) state.line += 1
      if (stream.match("$$", true)) {
        state.displayMath = false
        return "processingInstruction"
      }
      const closing = stream.string.indexOf("$$", stream.pos)
      if (closing === -1) stream.skipToEnd()
      else stream.pos = closing
      return "variableName.special"
    }
    if (stream.sol()) {
      const block = blockToken(stream, state)
      if (block !== null) return block
      if (stream.eol()) return null
    }
    return inlineToken(stream, state)
  },

  languageData: {
    commentTokens: { block: { open: "<!--", close: "-->" } },
    closeBrackets: { brackets: ["(", "[", "{", "`", '"'] },
  },
}

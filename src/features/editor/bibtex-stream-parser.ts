/**
 * A BibTeX tokenizer.
 *
 * BibTeX has two rules that a general-purpose highlighter gets wrong, and both
 * are visible as miscolouring rather than missing polish:
 *
 * - Everything outside an `@entry` is ignored by BibTeX, so it is shown as a
 *   comment rather than as content the file does not actually have.
 * - A value is delimited by braces or quotes and may contain either the other
 *   delimiter or a LaTeX accent, so its body is read as one string and its
 *   escapes are read as escapes.
 *
 * The parser never emits an error token: reporting mistakes belongs to the
 * diagnostics layer, not the highlighter.
 */

import type { StreamParser, StringStream } from "@codemirror/language"

export type BibtexTokenState = {
  /** Brace depth inside the current entry; 0 while outside one. */
  depth: number
  /** What the entry's top level expects next. */
  expect: "open" | "key" | "field" | "value" | "separator" | null
  /** The entry type being read, lowercased. */
  type: string | null
  /** Brace depth of the value being read, 0 when none is open. */
  valueDepth: number
  /** True while a quoted value is open. */
  quoted: boolean
}

/** Entry types whose first slot is a value rather than a citation key. */
const KEYLESS = new Set(["string", "preamble", "comment"])

/**
 * A LaTeX control sequence or escaped character inside a value. A backslash at
 * the end of a line escapes nothing, and is consumed on its own so the stream
 * always advances.
 */
function eatEscape(stream: StringStream): void {
  if (!stream.match(/^\\([a-zA-Z]+|[\s\S])/, true)) stream.next()
}

export const bibtexStreamParser: StreamParser<BibtexTokenState> = {
  name: "bibtex",

  startState: () => ({
    depth: 0,
    expect: null,
    type: null,
    valueDepth: 0,
    quoted: false,
  }),

  copyState: (state) => ({ ...state }),

  token(stream, state) {
    if (state.quoted) {
      if (stream.peek() === '"') {
        stream.next()
        state.quoted = false
        state.expect = "separator"
        return "bracket"
      }
      if (stream.peek() === "\\") {
        eatEscape(stream)
        return "escape"
      }
      stream.eatWhile(/[^"\\]/)
      return "string"
    }

    if (state.valueDepth > 0) {
      const character = stream.peek()
      if (character === "}") {
        stream.next()
        state.valueDepth -= 1
        if (state.valueDepth === 0) state.expect = "separator"
        return "bracket"
      }
      if (character === "{") {
        stream.next()
        state.valueDepth += 1
        return "bracket"
      }
      if (character === "\\") {
        eatEscape(stream)
        return "escape"
      }
      stream.eatWhile(/[^{}\\]/)
      return "string"
    }

    if (stream.eatSpace()) return null
    if (stream.peek() === "%") {
      stream.skipToEnd()
      return "comment"
    }

    if (state.depth === 0) {
      if (state.expect === "open") {
        const opening = stream.peek()
        if (opening === "{" || opening === "(") {
          stream.next()
          state.depth = 1
          state.expect =
            state.type === "preamble"
              ? "value"
              : KEYLESS.has(state.type ?? "")
                ? "field"
                : "key"
          return "bracket"
        }
        state.expect = null
      }
      const header = stream.match(/^@[A-Za-z]+/, true)
      if (Array.isArray(header)) {
        state.type = (header[0] ?? "").slice(1).toLowerCase()
        state.expect = "open"
        return "typeName"
      }
      // Text between entries is ignored by BibTeX, so it is shown as what it
      // is rather than as content.
      if (!stream.eatWhile(/[^@%]/)) stream.next()
      return "comment"
    }

    const character = stream.peek() ?? ""
    if (character === "}" || character === ")") {
      stream.next()
      state.depth -= 1
      if (state.depth <= 0) {
        state.depth = 0
        state.expect = null
        state.type = null
      }
      return "bracket"
    }
    if (character === ",") {
      stream.next()
      state.expect = "field"
      return "punctuation"
    }
    if (character === "=") {
      stream.next()
      state.expect = "value"
      return "operator"
    }
    if (character === "#") {
      stream.next()
      state.expect = "value"
      return "operator"
    }
    if (state.expect === "value") {
      if (character === "{") {
        stream.next()
        state.valueDepth = 1
        return "bracket"
      }
      if (character === '"') {
        stream.next()
        state.quoted = true
        return "bracket"
      }
      if (/\d/.test(character)) {
        stream.eatWhile(/\d/)
        state.expect = "separator"
        return "number"
      }
      if (/[A-Za-z]/.test(character)) {
        // A bare word is an abbreviation defined by an `@string` entry.
        stream.eatWhile(/[\w:.+-]/)
        state.expect = "separator"
        return "variableName"
      }
      stream.next()
      return null
    }
    if (state.expect === "key") {
      if (!stream.eatWhile(/[^,{}()%\s]/)) stream.next()
      state.expect = "separator"
      return "labelName"
    }
    if (/[A-Za-z]/.test(character)) {
      stream.eatWhile(/[\w:.+-]/)
      state.expect = "separator"
      return "propertyName"
    }
    if (character === "{") {
      stream.next()
      state.depth += 1
      return "bracket"
    }
    stream.next()
    return null
  },

  languageData: {
    // BibTeX has no comment syntax of its own; every tool in the LaTeX
    // ecosystem uses `%`, and text outside an entry is ignored anyway.
    commentTokens: { line: "%" },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
  },
}

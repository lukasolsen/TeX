/**
 * A LaTeX tokenizer that tracks the modes the legacy `stex` mode does not.
 *
 * Two of `stex`'s gaps are visible corruption rather than missing polish:
 *
 * - It parses verbatim bodies as LaTeX, so a `%` inside a code listing becomes
 *   a comment and a `$` opens math that never closes, miscolouring the rest of
 *   the file.
 * - It treats only `$`, `$$`, `\(`, and `\[` as mathematics, so the body of an
 *   `equation` or `align` environment is coloured as prose.
 *
 * This parser tracks verbatim environments, inline verbatim arguments, math
 * delimiters, and math environments. It never emits an error token: a
 * character it does not recognise is ordinary text, and reporting mistakes is
 * the diagnostics layer's job, not the highlighter's.
 */

import type { StreamParser, StringStream } from "@codemirror/language"

import { MATH_ENVIRONMENTS, VERBATIM_ENVIRONMENTS } from "@/domain/latex-syntax"

export type LatexTokenState = {
  /** Open math delimiters, innermost last. */
  math: string[]
  /** Open math environments, innermost last. */
  mathEnvironments: string[]
  /** The verbatim environment whose body the stream is inside. */
  verbatim: string | null
  /** The closing character of an inline `\verb`-style argument. */
  inlineVerbatim: string | null
  /** Set after `\begin` or `\end`, while its `{name}` is still expected. */
  expecting: "begin" | "end" | "inline-verbatim" | null
}

/** Commands taking one inline verbatim argument delimited by any character. */
const INLINE_VERBATIM = new Set(["verb", "Verb", "lstinline", "mintinline"])

function inMath(state: LatexTokenState): boolean {
  return state.math.length > 0 || state.mathEnvironments.length > 0
}

/** The delimiter that closes `opening`. */
function mathCloser(opening: string): string {
  if (opening === "\\(") return "\\)"
  if (opening === "\\[") return "\\]"
  return opening
}

function readEnvironmentName(stream: StringStream): string | null {
  const match = stream.match(/^\{([^{}]*)\}/, true)
  return Array.isArray(match) ? (match[1] ?? "") : null
}

/**
 * Consumes the body of a verbatim environment up to its `\end`, which is the
 * only sequence that may be read as LaTeX inside it.
 */
function tokenizeVerbatimBody(
  stream: StringStream,
  state: LatexTokenState,
  name: string
): string {
  const terminator = `\\end{${name}}`
  const at = stream.string.indexOf(terminator, stream.pos)
  if (at === stream.pos) {
    stream.pos += terminator.length
    state.verbatim = null
    return "keyword"
  }
  if (at > stream.pos) stream.pos = at
  else stream.skipToEnd()
  return "string"
}

export const latexStreamParser: StreamParser<LatexTokenState> = {
  name: "latex",

  startState: () => ({
    math: [],
    mathEnvironments: [],
    verbatim: null,
    inlineVerbatim: null,
    expecting: null,
  }),

  copyState: (state) => ({
    math: [...state.math],
    mathEnvironments: [...state.mathEnvironments],
    verbatim: state.verbatim,
    inlineVerbatim: state.inlineVerbatim,
    expecting: state.expecting,
  }),

  token(stream, state) {
    if (state.verbatim !== null) {
      return tokenizeVerbatimBody(stream, state, state.verbatim)
    }

    if (state.inlineVerbatim !== null) {
      const closing = state.inlineVerbatim
      // An inline verbatim argument never spans a line break.
      while (!stream.eol()) {
        if (stream.next() === closing) break
      }
      state.inlineVerbatim = null
      return "string"
    }

    if (state.expecting === "inline-verbatim") {
      state.expecting = null
      const delimiter = stream.next()
      if (delimiter !== undefined) state.inlineVerbatim = delimiter
      return "bracket"
    }

    if (state.expecting !== null) {
      if (stream.eatSpace()) return null
      const opening = state.expecting
      const name = readEnvironmentName(stream)
      state.expecting = null
      // A name that never closes its brace falls through to ordinary
      // tokenizing; returning here would consume nothing and stall the stream.
      if (name !== null) {
        if (opening === "begin") {
          if (VERBATIM_ENVIRONMENTS.has(name.replace(/\*$/, ""))) {
            state.verbatim = name
          } else if (MATH_ENVIRONMENTS.has(name.replace(/\*$/, ""))) {
            state.mathEnvironments.push(name)
          }
        } else if (state.mathEnvironments.at(-1) === name) {
          state.mathEnvironments.pop()
        }
        return "atom"
      }
    }

    if (stream.eatSpace()) return null

    if (stream.peek() === "%") {
      stream.skipToEnd()
      return "comment"
    }

    // Math delimiters are read before the generic escape rule, which would
    // otherwise swallow `\[` and `\(` as escaped characters.
    for (const opening of ["\\[", "\\("]) {
      if (stream.match(opening, true)) {
        state.math.push(opening)
        return "keyword"
      }
    }
    for (const closing of ["\\]", "\\)"]) {
      if (stream.match(closing, true)) {
        if (mathCloser(state.math.at(-1) ?? "") === closing) state.math.pop()
        return "keyword"
      }
    }
    for (const dollar of ["$$", "$"]) {
      if (stream.match(dollar, true)) {
        if (state.math.at(-1) === dollar) state.math.pop()
        else state.math.push(dollar)
        return "keyword"
      }
    }

    const command = stream.match(/^\\[a-zA-Z@]+\*?/, true)
    if (Array.isArray(command)) {
      const name = (command[0] ?? "").slice(1).replace(/\*$/, "")
      if (name === "begin" || name === "end") state.expecting = name
      else if (INLINE_VERBATIM.has(name)) state.expecting = "inline-verbatim"
      return "tagName"
    }

    // `\\` ends a line or a table row; every other escape stands for one
    // literal character.
    if (stream.match("\\\\", true)) return "keyword"
    if (stream.match(/^\\[^a-zA-Z@]/, true)) return "escape"

    if (stream.match(/^#\d?/, true)) return "meta"

    const character = stream.next()
    if (character === undefined) return null
    if (
      character === "{" ||
      character === "}" ||
      character === "[" ||
      character === "]"
    ) {
      return "bracket"
    }
    if (character === "&" || character === "~") return "keyword"

    if (inMath(state)) {
      if (character === "^" || character === "_") return "keyword"
      if (character === "(" || character === ")") return "bracket"
      if (/\d/.test(character)) {
        stream.eatWhile(/[\d.]/)
        return "number"
      }
      if (/[a-zA-Z]/.test(character)) {
        stream.eatWhile(/[a-zA-Z]/)
        return "variableName.special"
      }
      return "variableName.special"
    }

    // Ordinary prose advances a run at a time so a paragraph is not tokenized
    // one character at a time.
    stream.eatWhile(/[^\\{}[\]$%&~#]/)
    return null
  },

  languageData: {
    commentTokens: { line: "%" },
    closeBrackets: { brackets: ["(", "[", "{"] },
  },
}

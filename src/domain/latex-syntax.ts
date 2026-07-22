/**
 * A single-pass structural model of a LaTeX document.
 *
 * Every editor feature that needs to understand the document — folding,
 * delimiter matching, diagnostics, the outline, cross-reference navigation —
 * reads this model rather than applying its own pattern matching, so the
 * features cannot disagree about where an environment ends or whether a
 * position is inside math or verbatim text.
 *
 * The scan is linear and bounded: it consumes escapes as it goes rather than
 * looking behind for backslashes, and it stops recording once a ceiling is
 * reached, so pathological input degrades to fewer results instead of to a
 * hang.
 */

import { resolveLatexFilePath } from "@/domain/latex"
import type { ProjectRelativePath } from "@/domain/identifiers"

export type LatexRegionKind = "environment" | "math" | "verbatim" | "comment"

export type LatexRegion = Readonly<{
  kind: LatexRegionKind
  /** Environment name, math delimiter (`$`, `$$`, `\(`, `\[`), or `""`. */
  name: string
  /** Start of the opening delimiter. */
  from: number
  /** End of the closing delimiter, or the document end when unclosed. */
  to: number
  /** First position inside the region. */
  bodyFrom: number
  /** Position just past the last character inside the region. */
  bodyTo: number
  closed: boolean
  depth: number
}>

export type LatexSymbolRole =
  | "label-definition"
  | "label-reference"
  | "citation-reference"
  | "citation-definition"
  | "package"
  | "document-class"
  | "macro-definition"
  | "environment-definition"
  | "file-reference"
  | "section"

export type LatexOccurrence = Readonly<{
  role: LatexSymbolRole
  /** The symbol text exactly as written, with surrounding whitespace removed. */
  name: string
  /** Start of `name` in the source. */
  from: number
  /** End of `name` in the source. */
  to: number
  /** The command that introduced the occurrence, without its backslash. */
  command: string
  /**
   * For `file-reference`, the project-relative path the value resolves to;
   * `null` for every other role and for values that cannot be resolved.
   */
  path: ProjectRelativePath | null
}>

export type LatexStructuralProblemKind =
  | "unclosed-environment"
  | "unopened-environment"
  | "mismatched-environment"
  | "unclosed-math"
  | "unclosed-group"

export type LatexStructuralProblem = Readonly<{
  kind: LatexStructuralProblemKind
  /** The environment or delimiter the problem concerns. */
  name: string
  from: number
  to: number
  /** The name that would have balanced the document, when one is known. */
  expected: string | null
}>

export type LatexDocumentModel = Readonly<{
  regions: readonly LatexRegion[]
  occurrences: readonly LatexOccurrence[]
  problems: readonly LatexStructuralProblem[]
  /** True when a ceiling stopped the scan, so the model is incomplete. */
  truncated: boolean
}>

/**
 * Sectioning commands and their depth, shallowest first. The depth decides
 * which heading ends another heading's span when folding or outlining.
 */
export const SECTION_LEVELS: ReadonlyMap<string, number> = new Map([
  ["part", 0],
  ["chapter", 1],
  ["section", 2],
  ["subsection", 3],
  ["subsubsection", 4],
  ["paragraph", 5],
  ["subparagraph", 6],
])

/** Environments whose body is typeset as mathematics. */
export const MATH_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "align",
  "alignat",
  "aligned",
  "alignedat",
  "array",
  "cases",
  "displaymath",
  "dmath",
  "eqnarray",
  "equation",
  "flalign",
  "gather",
  "gathered",
  "math",
  "multline",
  "split",
  "subequations",
])

/** Environments whose body is reproduced verbatim and must not be parsed. */
export const VERBATIM_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "alltt",
  "BVerbatim",
  "code",
  "comment",
  "filecontents",
  "lstlisting",
  "LVerbatim",
  "minted",
  "sagesilent",
  "Verbatim",
  "verbatim",
])

const LABEL_REFERENCE_COMMANDS: ReadonlySet<string> = new Set([
  "autopageref",
  "autoref",
  "cpageref",
  "Cpageref",
  "cref",
  "Cref",
  "crefrange",
  "Crefrange",
  "eqref",
  "fullref",
  "labelcref",
  "nameref",
  "pageref",
  "ref",
  "vref",
  "Vref",
])

const CITATION_COMMANDS: ReadonlySet<string> = new Set([
  "autocite",
  "Autocite",
  "citealp",
  "citealt",
  "citeauthor",
  "cite",
  "citenum",
  "citep",
  "citet",
  "citeyear",
  "citeyearpar",
  "footcite",
  "fullcite",
  "nocite",
  "parencite",
  "Parencite",
  "smartcite",
  "supercite",
  "textcite",
  "Textcite",
])

const PACKAGE_COMMANDS: ReadonlySet<string> = new Set([
  "usepackage",
  "RequirePackage",
])

const CLASS_COMMANDS: ReadonlySet<string> = new Set([
  "documentclass",
  "LoadClass",
])

const MACRO_DEFINITION_COMMANDS: ReadonlySet<string> = new Set([
  "DeclareMathOperator",
  "DeclarePairedDelimiter",
  "NewDocumentCommand",
  "newcommand",
  "providecommand",
  "ProvideDocumentCommand",
  "renewcommand",
  "RenewDocumentCommand",
])

const ENVIRONMENT_DEFINITION_COMMANDS: ReadonlySet<string> = new Set([
  "newenvironment",
  "NewDocumentEnvironment",
  "renewenvironment",
  "RenewDocumentEnvironment",
])

/**
 * Commands whose named argument holds a file path, mapped to the index of the
 * required group that holds it. The path itself is resolved by
 * `resolveLatexFilePath`, which owns extension and directory rules.
 */
const FILE_COMMANDS: ReadonlyMap<string, number> = new Map([
  ["addbibresource", 0],
  ["bibliography", 0],
  ["include", 0],
  ["includefrom", 1],
  ["includegraphics", 0],
  ["import", 1],
  ["input", 0],
  ["inputminted", 1],
  ["lstinputlisting", 0],
  ["subfile", 0],
  ["subimport", 1],
  ["subincludefrom", 1],
  ["verbatiminput", 0],
  ["VerbatimInput", 0],
])

/** Commands that take one inline verbatim argument delimited by any character. */
const INLINE_VERBATIM_COMMANDS: ReadonlySet<string> = new Set([
  "lstinline",
  "mintinline",
  "verb",
  "Verb",
])

const MAX_REGIONS = 20_000
const MAX_OCCURRENCES = 20_000
const MAX_PROBLEMS = 200
const MAX_ARGUMENT_GROUPS = 4
const MAX_ENVIRONMENT_NAME = 128

type ArgumentGroup = Readonly<{
  kind: "optional" | "required"
  /** First position inside the delimiters. */
  from: number
  /** Position of the closing delimiter. */
  to: number
  value: string
}>

type OpenEnvironment = {
  name: string
  from: number
  bodyFrom: number
  depth: number
}

type OpenMath = {
  name: string
  from: number
  bodyFrom: number
  depth: number
}

/**
 * Character classification runs once per source character on the scan's hot
 * path, so it compares code points directly rather than invoking a regular
 * expression per character.
 */
function isCommandCharacterAt(source: string, index: number): boolean {
  const code = source.charCodeAt(index)
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 64 /* @ */
  )
}

function isWhitespaceAt(source: string, index: number): boolean {
  const code = source.charCodeAt(index)
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12
}

/**
 * Reads the delimited groups that follow `index`, tolerating whitespace but
 * stopping at a blank line, which ends a LaTeX paragraph and therefore cannot
 * separate a command from its argument.
 */
function readArguments(source: string, index: number): ArgumentGroup[] {
  const groups: ArgumentGroup[] = []
  let cursor = index
  while (groups.length < MAX_ARGUMENT_GROUPS) {
    let newlines = 0
    while (cursor < source.length && isWhitespaceAt(source, cursor)) {
      if (source[cursor] === "\n") newlines += 1
      if (newlines > 1) return groups
      cursor += 1
    }
    const opening = source[cursor]
    if (opening !== "[" && opening !== "{") return groups
    const closing = opening === "[" ? "]" : "}"
    const from = cursor + 1
    let depth = 1
    let scan = from
    while (scan < source.length) {
      const character = source[scan]
      if (character === "\\") {
        scan += 2
        continue
      }
      if (character === opening) depth += 1
      else if (character === closing) {
        depth -= 1
        if (depth === 0) break
      }
      scan += 1
    }
    if (scan >= source.length) return groups
    groups.push({
      kind: opening === "[" ? "optional" : "required",
      from,
      to: scan,
      value: source.slice(from, scan),
    })
    cursor = scan + 1
  }
  return groups
}

function requiredGroups(groups: readonly ArgumentGroup[]): ArgumentGroup[] {
  return groups.filter(({ kind }) => kind === "required")
}

/** Splits a comma-separated group value into trimmed values with exact spans. */
function commaValues(group: ArgumentGroup): Array<{
  value: string
  from: number
  to: number
}> {
  const values: Array<{ value: string; from: number; to: number }> = []
  let offset = 0
  for (const raw of group.value.split(",")) {
    const leading = raw.length - raw.trimStart().length
    const value = raw.trim()
    if (value !== "") {
      const from = group.from + offset + leading
      values.push({ value, from, to: from + value.length })
    }
    offset += raw.length + 1
  }
  return values
}

/** The single trimmed value of a group, with its exact span. */
function singleValue(
  group: ArgumentGroup
): { value: string; from: number; to: number } | null {
  const leading = group.value.length - group.value.trimStart().length
  const value = group.value.trim()
  if (value === "") return null
  const from = group.from + leading
  return { value, from, to: from + value.length }
}

/**
 * The environment name in the group immediately following `index`, and the
 * position just past its closing brace. Bounded so an unclosed brace cannot
 * make the enclosing scan quadratic.
 */
function readEnvironmentName(
  source: string,
  index: number
): { name: string; next: number } | null {
  let cursor = index
  while (cursor < source.length && /[ \t]/.test(source[cursor] ?? "")) {
    cursor += 1
  }
  if (source[cursor] !== "{") return null
  const from = cursor + 1
  const limit = Math.min(source.length, from + MAX_ENVIRONMENT_NAME)
  const close = source.indexOf("}", from)
  if (close === -1 || close > limit) return null
  return { name: source.slice(from, close).trim(), next: close + 1 }
}

/**
 * Parses `source` into regions, symbol occurrences, and structural problems.
 *
 * `sourcePath` is used only to resolve file references relative to the file
 * being parsed; pass `null` when file resolution is not needed.
 */
export function parseLatexDocument(
  source: string,
  sourcePath: ProjectRelativePath | null = null
): LatexDocumentModel {
  const regions: LatexRegion[] = []
  const occurrences: LatexOccurrence[] = []
  const problems: LatexStructuralProblem[] = []
  const environments: OpenEnvironment[] = []
  const math: OpenMath[] = []
  const groups: number[] = []
  let truncated = false

  const addRegion = (region: LatexRegion) => {
    if (regions.length >= MAX_REGIONS) {
      truncated = true
      return
    }
    regions.push(region)
  }
  const addOccurrence = (occurrence: LatexOccurrence) => {
    if (occurrences.length >= MAX_OCCURRENCES) {
      truncated = true
      return
    }
    occurrences.push(occurrence)
  }
  const addProblem = (problem: LatexStructuralProblem) => {
    if (problems.length >= MAX_PROBLEMS) {
      truncated = true
      return
    }
    problems.push(problem)
  }

  const closeEnvironment = (
    open: OpenEnvironment,
    from: number,
    to: number,
    closed: boolean
  ) => {
    addRegion({
      kind: VERBATIM_ENVIRONMENTS.has(open.name) ? "verbatim" : "environment",
      name: open.name,
      from: open.from,
      to,
      bodyFrom: open.bodyFrom,
      bodyTo: from,
      closed,
      depth: open.depth,
    })
  }

  let index = 0
  // Whole-line comment spans, merged into foldable runs after the scan so the
  // hot loop does no per-character bookkeeping.
  const commentLines: Array<{ from: number; to: number }> = []

  while (index < source.length) {
    const character = source[index]

    if (character === "%") {
      const lineStart = source.lastIndexOf("\n", index - 1) + 1
      const lineEnd = source.indexOf("\n", index)
      const end = lineEnd === -1 ? source.length : lineEnd
      if (source.slice(lineStart, index).trim() === "") {
        commentLines.push({ from: index, to: end })
      }
      index = end === source.length ? end : end + 1
      continue
    }

    if (character === "$") {
      const display = source[index + 1] === "$"
      const delimiter = display ? "$$" : "$"
      const top = math.at(-1)
      if (top !== undefined && top.name === delimiter) {
        math.pop()
        addRegion({
          kind: "math",
          name: delimiter,
          from: top.from,
          to: index + delimiter.length,
          bodyFrom: top.bodyFrom,
          bodyTo: index,
          closed: true,
          depth: top.depth,
        })
      } else {
        math.push({
          name: delimiter,
          from: index,
          bodyFrom: index + delimiter.length,
          depth: math.length,
        })
      }
      index += delimiter.length
      continue
    }

    if (character === "{") {
      groups.push(index)
      index += 1
      continue
    }

    if (character === "}") {
      groups.pop()
      index += 1
      continue
    }

    if (character !== "\\") {
      index += 1
      continue
    }

    const commandStart = index
    let nameEnd = index + 1
    while (nameEnd < source.length && isCommandCharacterAt(source, nameEnd)) {
      nameEnd += 1
    }

    if (nameEnd === index + 1) {
      const escaped = source[index + 1]
      if (escaped === "(" || escaped === "[") {
        const delimiter = escaped === "(" ? "\\(" : "\\["
        math.push({
          name: delimiter,
          from: index,
          bodyFrom: index + 2,
          depth: math.length,
        })
      } else if (escaped === ")" || escaped === "]") {
        const expected = escaped === ")" ? "\\(" : "\\["
        const top = math.at(-1)
        if (top !== undefined && top.name === expected) {
          math.pop()
          addRegion({
            kind: "math",
            name: expected,
            from: top.from,
            to: index + 2,
            bodyFrom: top.bodyFrom,
            bodyTo: index,
            closed: true,
            depth: top.depth,
          })
        }
      }
      // Any other escape consumes exactly the escaped character, which is how
      // `\%`, `\{`, `\$`, and `\\` avoid being mistaken for structure.
      index += escaped === undefined ? 1 : 2
      continue
    }

    const command = source.slice(index + 1, nameEnd)
    const afterName = source[nameEnd] === "*" ? nameEnd + 1 : nameEnd

    if (command === "begin") {
      const parsed = readEnvironmentName(source, afterName)
      if (parsed === null) {
        index = afterName
        continue
      }
      environments.push({
        name: parsed.name,
        from: commandStart,
        bodyFrom: parsed.next,
        depth: environments.length,
      })
      if (VERBATIM_ENVIRONMENTS.has(parsed.name)) {
        const terminator = `\\end{${parsed.name}}`
        const close = source.indexOf(terminator, parsed.next)
        const open = environments.pop()
        if (open !== undefined) {
          if (close === -1) {
            closeEnvironment(open, source.length, source.length, false)
            addProblem({
              kind: "unclosed-environment",
              name: parsed.name,
              from: commandStart,
              to: parsed.next,
              expected: `\\end{${parsed.name}}`,
            })
            index = source.length
            continue
          }
          closeEnvironment(open, close, close + terminator.length, true)
        }
        index = close === -1 ? source.length : close + terminator.length
        continue
      }
      index = parsed.next
      continue
    }

    if (command === "end") {
      const parsed = readEnvironmentName(source, afterName)
      if (parsed === null) {
        index = afterName
        continue
      }
      const matchIndex = environments.findLastIndex(
        (open) => open.name === parsed.name
      )
      if (matchIndex === -1) {
        addProblem({
          kind: "unopened-environment",
          name: parsed.name,
          from: commandStart,
          to: parsed.next,
          expected: null,
        })
      } else {
        // Everything opened after the matched environment never closed.
        for (
          let depth = environments.length - 1;
          depth > matchIndex;
          depth -= 1
        ) {
          const stranded = environments[depth]
          if (stranded === undefined) continue
          closeEnvironment(stranded, commandStart, commandStart, false)
          addProblem({
            kind: "mismatched-environment",
            name: stranded.name,
            from: stranded.from,
            to: stranded.bodyFrom,
            expected: `\\end{${stranded.name}}`,
          })
        }
        const open = environments[matchIndex]
        if (open !== undefined) {
          closeEnvironment(open, commandStart, parsed.next, true)
        }
        environments.length = matchIndex
      }
      index = parsed.next
      continue
    }

    if (INLINE_VERBATIM_COMMANDS.has(command)) {
      let cursor = afterName
      if (source[cursor] === "{") {
        // `\mintinline{lang}|code|` takes a language argument first.
        const close = source.indexOf("}", cursor)
        cursor = close === -1 ? source.length : close + 1
      }
      const delimiter = source[cursor]
      if (delimiter === undefined || delimiter === "\n") {
        index = cursor
        continue
      }
      const lineEnd = source.indexOf("\n", cursor + 1)
      const limit = lineEnd === -1 ? source.length : lineEnd
      const close = source.indexOf(delimiter, cursor + 1)
      const end = close === -1 || close > limit ? limit : close + 1
      addRegion({
        kind: "verbatim",
        name: command,
        from: commandStart,
        to: end,
        bodyFrom: cursor + 1,
        bodyTo: Math.max(cursor + 1, end - 1),
        closed: close !== -1 && close <= limit,
        depth: 0,
      })
      index = end
      continue
    }

    collectOccurrences(source, command, afterName, sourcePath, addOccurrence)
    index = afterName
  }

  // Adjacent whole-line comments form one foldable block; a blank line or any
  // code between them starts a new one.
  for (let start = 0; start < commentLines.length; start += 1) {
    let end = start
    while (end + 1 < commentLines.length) {
      const current = commentLines[end]
      const next = commentLines[end + 1]
      if (current === undefined || next === undefined) break
      const between = source.slice(current.to, next.from)
      if (between.trim() !== "" || between.split("\n").length !== 2) break
      end += 1
    }
    const first = commentLines[start]
    const last = commentLines[end]
    if (first !== undefined && last !== undefined) {
      addRegion({
        kind: "comment",
        name: "",
        from: first.from,
        to: last.to,
        bodyFrom: first.from,
        bodyTo: last.to,
        closed: true,
        depth: 0,
      })
    }
    start = end
  }

  for (const open of environments) {
    closeEnvironment(open, source.length, source.length, false)
    addProblem({
      kind: "unclosed-environment",
      name: open.name,
      from: open.from,
      to: open.bodyFrom,
      expected: `\\end{${open.name}}`,
    })
  }
  for (const open of math) {
    addRegion({
      kind: "math",
      name: open.name,
      from: open.from,
      to: source.length,
      bodyFrom: open.bodyFrom,
      bodyTo: source.length,
      closed: false,
      depth: open.depth,
    })
    addProblem({
      kind: "unclosed-math",
      name: open.name,
      from: open.from,
      to: open.bodyFrom,
      expected:
        open.name === "\\(" ? "\\)" : open.name === "\\[" ? "\\]" : open.name,
    })
  }
  for (const open of groups) {
    addProblem({
      kind: "unclosed-group",
      name: "{",
      from: open,
      to: open + 1,
      expected: "}",
    })
  }

  regions.sort((left, right) => left.from - right.from || right.to - left.to)
  occurrences.sort((left, right) => left.from - right.from)
  problems.sort((left, right) => left.from - right.from)

  return { regions, occurrences, problems, truncated }
}

function collectOccurrences(
  source: string,
  command: string,
  afterName: number,
  sourcePath: ProjectRelativePath | null,
  add: (occurrence: LatexOccurrence) => void
): void {
  const isFileCommand = FILE_COMMANDS.has(command)
  if (
    !isFileCommand &&
    !SECTION_LEVELS.has(command) &&
    command !== "label" &&
    command !== "bibitem" &&
    !LABEL_REFERENCE_COMMANDS.has(command) &&
    !CITATION_COMMANDS.has(command) &&
    !PACKAGE_COMMANDS.has(command) &&
    !CLASS_COMMANDS.has(command) &&
    !MACRO_DEFINITION_COMMANDS.has(command) &&
    !ENVIRONMENT_DEFINITION_COMMANDS.has(command)
  ) {
    return
  }

  const parsed = readArguments(source, afterName)
  const required = requiredGroups(parsed)

  if (SECTION_LEVELS.has(command)) {
    const value = required[0] === undefined ? null : singleValue(required[0])
    if (value !== null) {
      add({
        role: "section",
        name: value.value,
        from: value.from,
        to: value.to,
        command,
        path: null,
      })
    }
    return
  }

  if (command === "label") {
    const value = required[0] === undefined ? null : singleValue(required[0])
    if (value !== null) {
      add({
        role: "label-definition",
        name: value.value,
        from: value.from,
        to: value.to,
        command,
        path: null,
      })
    }
    return
  }

  if (command === "bibitem") {
    const value = required[0] === undefined ? null : singleValue(required[0])
    if (value !== null) {
      add({
        role: "citation-definition",
        name: value.value,
        from: value.from,
        to: value.to,
        command,
        path: null,
      })
    }
    return
  }

  if (LABEL_REFERENCE_COMMANDS.has(command)) {
    addCommaValues(required[0], "label-reference", command, add)
    return
  }

  if (CITATION_COMMANDS.has(command)) {
    // Biblatex's multi-cite commands place keys in the last required group.
    addCommaValues(required.at(-1), "citation-reference", command, add)
    return
  }

  if (PACKAGE_COMMANDS.has(command)) {
    addCommaValues(required[0], "package", command, add)
    return
  }

  if (CLASS_COMMANDS.has(command)) {
    addCommaValues(required[0], "document-class", command, add)
    return
  }

  if (MACRO_DEFINITION_COMMANDS.has(command)) {
    const defined = definedMacroName(source, parsed, afterName)
    if (defined !== null) {
      add({
        role: "macro-definition",
        name: defined.value,
        from: defined.from,
        to: defined.to,
        command,
        path: null,
      })
    }
    return
  }

  if (ENVIRONMENT_DEFINITION_COMMANDS.has(command)) {
    const value = required[0] === undefined ? null : singleValue(required[0])
    if (value !== null) {
      add({
        role: "environment-definition",
        name: value.value,
        from: value.from,
        to: value.to,
        command,
        path: null,
      })
    }
    return
  }

  if (sourcePath === null) return
  const groupIndex = FILE_COMMANDS.get(command)
  if (groupIndex === undefined) return
  const group = required[groupIndex]
  if (group === undefined) return
  const directoryGroup = groupIndex === 0 ? undefined : required[0]
  const directory =
    directoryGroup === undefined
      ? ""
      : (singleValue(directoryGroup)?.value ?? "")
  for (const value of commaValues(group)) {
    const combined =
      directory === ""
        ? value.value
        : `${directory}${directory.endsWith("/") ? "" : "/"}${value.value}`
    add({
      role: "file-reference",
      name: value.value,
      from: value.from,
      to: value.to,
      command,
      path: resolveLatexFilePath(combined, sourcePath, command),
    })
  }
}

/**
 * The macro name a definition command introduces, accepting both the braced
 * `\newcommand{\name}` and the bare `\newcommand\name` spellings.
 */
function definedMacroName(
  source: string,
  parsed: readonly ArgumentGroup[],
  afterName: number
): { value: string; from: number; to: number } | null {
  const first = parsed[0]
  if (first !== undefined && first.kind === "required") {
    const value = singleValue(first)
    if (value !== null && value.value.startsWith("\\")) {
      return {
        value: value.value.slice(1),
        from: value.from + 1,
        to: value.to,
      }
    }
    return null
  }
  let cursor = afterName
  while (cursor < source.length && /[ \t]/.test(source[cursor] ?? "")) {
    cursor += 1
  }
  if (source[cursor] !== "\\") return null
  let end = cursor + 1
  while (end < source.length && isCommandCharacterAt(source, end)) end += 1
  return end === cursor + 1
    ? null
    : { value: source.slice(cursor + 1, end), from: cursor + 1, to: end }
}

function addCommaValues(
  group: ArgumentGroup | undefined,
  role: LatexSymbolRole,
  command: string,
  add: (occurrence: LatexOccurrence) => void
): void {
  if (group === undefined) return
  for (const value of commaValues(group)) {
    add({
      role,
      name: value.value,
      from: value.from,
      to: value.to,
      command,
      path: null,
    })
  }
}

/** The innermost region containing `position`, or `null` outside every region. */
export function latexRegionAt(
  model: LatexDocumentModel,
  position: number
): LatexRegion | null {
  let innermost: LatexRegion | null = null
  for (const region of model.regions) {
    if (region.from > position) break
    if (position >= region.to) continue
    if (innermost === null || region.from >= innermost.from) innermost = region
  }
  return innermost
}

/** True when `position` is typeset as mathematics. */
export function isMathPosition(
  model: LatexDocumentModel,
  position: number
): boolean {
  for (const region of model.regions) {
    if (region.from > position) break
    if (position < region.bodyFrom || position >= region.bodyTo) continue
    if (region.kind === "math") return true
    if (region.kind === "environment" && MATH_ENVIRONMENTS.has(region.name)) {
      return true
    }
  }
  return false
}

/** True when `position` is inside verbatim text or a comment. */
export function isLiteralPosition(
  model: LatexDocumentModel,
  position: number
): boolean {
  for (const region of model.regions) {
    if (region.from > position) break
    if (region.kind !== "verbatim" && region.kind !== "comment") continue
    if (position >= region.from && position < region.to) return true
  }
  return false
}

/** The occurrence whose span contains `position`, or `null`. */
export function latexOccurrenceAt(
  model: LatexDocumentModel,
  position: number
): LatexOccurrence | null {
  return (
    model.occurrences.find(
      ({ from, to }) => position >= from && position <= to
    ) ?? null
  )
}

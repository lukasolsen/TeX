/**
 * A structural reading of a `.bib` file.
 *
 * BibTeX's grammar is small but unforgiving: everything outside an `@entry` is
 * ignored, braces nest, and a quoted value hides the delimiters inside it. One
 * scanner answers every structural question the editor asks — where entries
 * begin and end, and what the caret is in the middle of typing — so folding and
 * completion can never disagree about the same file.
 */

export type BibtexEntry = Readonly<{
  /** The type as written, lowercased and without its `@`. */
  type: string
  /** The citation key, or `null` for `@string`, `@preamble`, and `@comment`. */
  key: string | null
  /** Offset of the `@`. */
  from: number
  /** Offset just past the closing delimiter, or the end of the file when the entry never closes. */
  to: number
  /** Whether the entry has a closing delimiter at all. */
  closed: boolean
  /** Field names in the entry, lowercased, in the order they appear. */
  fields: readonly string[]
}>

/** Entry types that carry named values instead of a citation key. */
const KEYLESS_TYPES = new Set(["string", "preamble", "comment"])

/** True while `index` is inside a `%` comment on its line. */
function isCommentStart(content: string, index: number): boolean {
  return content[index] === "%"
}

function skipToLineEnd(content: string, index: number): number {
  const newline = content.indexOf("\n", index)
  return newline === -1 ? content.length : newline
}

/**
 * Every entry in a `.bib` file, in document order.
 *
 * Unterminated entries are reported rather than dropped: a file is scanned
 * while it is being typed, and an entry the author has not finished closing is
 * still the entry their caret is in.
 */
export function bibtexEntries(content: string): BibtexEntry[] {
  const entries: BibtexEntry[] = []
  let index = 0
  while (index < content.length) {
    if (isCommentStart(content, index)) {
      index = skipToLineEnd(content, index)
      continue
    }
    if (content[index] !== "@") {
      index += 1
      continue
    }
    const entry = readEntry(content, index)
    if (entry === null) {
      index += 1
      continue
    }
    entries.push(entry)
    // An unterminated entry swallows the rest of the file; stopping here keeps
    // the scan from reporting the same text twice.
    index = entry.closed ? entry.to : content.length
  }
  return entries
}

/** Reads one entry starting at the `@` in `start`, or `null` when none begins there. */
function readEntry(content: string, start: number): BibtexEntry | null {
  const header = /^@([A-Za-z]+)[ \t\r\n]*([{(])/.exec(content.slice(start))
  if (header === null) return null
  const type = (header[1] ?? "").toLowerCase()
  const opening = header[2] === "(" ? ")" : "}"
  let index = start + header[0].length
  let depth = 1
  let quoted = false
  const fields: string[] = []
  let key: string | null = null
  let slotStart = index
  let sawEquals = false

  const closeSlot = (end: number) => {
    const text = content.slice(slotStart, end)
    if (sawEquals) {
      const name = /^[ \t\r\n]*([A-Za-z][\w:.+-]*)/.exec(text)
      if (name !== null) fields.push((name[1] ?? "").toLowerCase())
    } else if (key === null && !KEYLESS_TYPES.has(type)) {
      const trimmed = text.trim()
      if (trimmed !== "") key = trimmed
    }
    sawEquals = false
  }

  while (index < content.length) {
    const character = content[index]
    if (quoted) {
      if (character === "\\") index += 1
      else if (character === '"' && depth === 1) quoted = false
      index += 1
      continue
    }
    if (depth === 1 && character === "%") {
      index = skipToLineEnd(content, index)
      continue
    }
    if (character === "\\") {
      index += 2
      continue
    }
    if (character === "{") depth += 1
    else if (character === "(" && opening === ")") depth += 1
    else if (character === "}" || character === opening) {
      depth -= 1
      if (depth === 0) {
        closeSlot(index)
        return {
          type,
          key,
          from: start,
          to: index + 1,
          closed: true,
          fields,
        }
      }
    } else if (depth === 1) {
      if (character === '"') quoted = true
      else if (character === "=") sawEquals = true
      else if (character === ",") {
        closeSlot(index)
        slotStart = index + 1
      }
    }
    index += 1
  }
  closeSlot(content.length)
  return { type, key, from: start, to: content.length, closed: false, fields }
}

export type BibtexCompletionContext =
  | Readonly<{
      kind: "entry-type"
      /** Offset of the `@`: the completion replaces the marker with it. */
      from: number
      to: number
      query: string
    }>
  | Readonly<{
      kind: "field"
      from: number
      to: number
      query: string
      /** The entry the field is being added to, lowercased. */
      entryType: string
      /** Field names the entry already carries, so they are not offered twice. */
      present: readonly string[]
    }>

/**
 * What the caret is in the middle of typing, or `null` where no suggestion is
 * meaningful — inside a value, a comment, or free text between entries.
 */
export function bibtexCompletionContextAt(
  content: string,
  position: number
): BibtexCompletionContext | null {
  const before = content.slice(0, position)
  const lineStart = before.lastIndexOf("\n") + 1
  if (before.includes("%", lineStart)) return null

  const marker = /@([A-Za-z]*)$/.exec(before)
  if (marker !== null) {
    return {
      kind: "entry-type",
      from: position - (marker[0] ?? "").length,
      to: position,
      query: marker[1] ?? "",
    }
  }

  const entry = bibtexEntries(content).find(
    (candidate) => position > candidate.from && position <= candidate.to
  )
  if (entry === undefined) return null
  const slot = slotAt(content, entry, position)
  if (slot === null) return null
  const word = /([A-Za-z][\w:.+-]*)?$/.exec(before.slice(slot))
  const query = word?.[1] ?? ""
  return {
    kind: "field",
    from: position - query.length,
    to: position,
    query,
    entryType: entry.type,
    present: entry.fields,
  }
}

/**
 * The offset a field name would start at, or `null` when `position` is not in a
 * field-name slot: inside a value, a nested group, a quoted string, or the
 * citation key.
 */
function slotAt(
  content: string,
  entry: BibtexEntry,
  position: number
): number | null {
  const header = /^@[A-Za-z]+[ \t\r\n]*[{(]/.exec(content.slice(entry.from))
  if (header === null) return null
  let index = entry.from + header[0].length
  let depth = 1
  let quoted = false
  let slotStart = index
  let sawEquals = false
  let slotIndex = 0
  while (index < position && index < content.length) {
    const character = content[index]
    if (quoted) {
      if (character === "\\") index += 1
      else if (character === '"' && depth === 1) quoted = false
      index += 1
      continue
    }
    if (depth === 1 && character === "%") {
      index = skipToLineEnd(content, index)
      continue
    }
    if (character === "\\") {
      index += 2
      continue
    }
    if (character === "{" || character === "(") depth += 1
    else if (character === "}" || character === ")") depth -= 1
    else if (depth === 1) {
      if (character === '"') quoted = true
      else if (character === "=") sawEquals = true
      else if (character === ",") {
        slotStart = index + 1
        slotIndex += 1
        sawEquals = false
      }
    }
    index += 1
  }
  if (depth !== 1 || quoted || sawEquals) return null
  // The first slot of a keyed entry is its citation key, which only the author
  // can name.
  if (slotIndex === 0 && !KEYLESS_TYPES.has(entry.type)) return null
  // A field name is a bare word; anything else in the slot means the caret is
  // past the point where a name could still be completed.
  if (
    !/^[ \t\r\n]*[A-Za-z][\w:.+-]*$|^[ \t\r\n]*$/.test(
      content.slice(slotStart, position)
    )
  ) {
    return null
  }
  return slotStart
}

/**
 * What the cursor is asking for, decided from the text alone.
 *
 * The backend owns completion that needs the project — labels, citations,
 * files, local macros. This decides the cases answerable from the buffer and
 * the bundled catalog, so those keep working when the project analysis is slow
 * or unavailable, and so the editor knows which catalog to offer.
 */

export type LatexCompletionContext =
  | Readonly<{ kind: "command"; from: number; prefix: string }>
  | Readonly<{
      kind: "environment"
      from: number
      prefix: string
      closing: boolean
    }>
  | Readonly<{ kind: "package"; from: number; prefix: string }>
  | Readonly<{ kind: "document-class"; from: number; prefix: string }>
  | Readonly<{
      kind: "argument"
      command: string
      from: number
      prefix: string
    }>

const PACKAGE_COMMANDS = new Set(["usepackage", "RequirePackage"])
const CLASS_COMMANDS = new Set(["documentclass", "LoadClass"])

function isEscaped(source: string, position: number): boolean {
  let slashes = 0
  for (
    let index = position - 1;
    index >= 0 && source[index] === "\\";
    index -= 1
  ) {
    slashes += 1
  }
  return slashes % 2 === 1
}

/** True when a comment starts before `position` on its line. */
function inComment(
  source: string,
  lineStart: number,
  position: number
): boolean {
  for (let index = lineStart; index < position; index += 1) {
    if (source[index] === "%" && !isEscaped(source, index)) return true
  }
  return false
}

/**
 * The innermost unescaped `{` still open at `position` on its line, or `null`
 * when the cursor is not inside a brace group.
 */
function enclosingBrace(
  source: string,
  lineStart: number,
  position: number
): number | null {
  const stack: number[] = []
  for (let index = lineStart; index < position; index += 1) {
    if (isEscaped(source, index)) continue
    if (source[index] === "{") stack.push(index)
    else if (source[index] === "}") stack.pop()
  }
  return stack.at(-1) ?? null
}

/**
 * The command owning the group opened at `braceOpen`, skipping one optional
 * `[…]` group between them.
 */
function owningCommand(
  source: string,
  lineStart: number,
  braceOpen: number
): string | null {
  let nameEnd = braceOpen
  if (source[nameEnd - 1] === "]" && !isEscaped(source, nameEnd - 1)) {
    let depth = 0
    let index = nameEnd - 1
    for (; index >= lineStart; index -= 1) {
      if (isEscaped(source, index)) continue
      if (source[index] === "]") depth += 1
      else if (source[index] === "[") {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (index < lineStart) return null
    nameEnd = index
  }
  if (source[nameEnd - 1] === "*") nameEnd -= 1
  let nameStart = nameEnd
  while (
    nameStart > lineStart &&
    /[A-Za-z@]/.test(source[nameStart - 1] ?? "")
  ) {
    nameStart -= 1
  }
  if (nameStart === nameEnd || source[nameStart - 1] !== "\\") return null
  return isEscaped(source, nameStart - 1)
    ? null
    : source.slice(nameStart, nameEnd)
}

/**
 * The replacement start and typed prefix inside a brace group, measured from
 * the last comma so a comma-separated list completes its final entry.
 */
function argumentPrefix(
  source: string,
  braceOpen: number,
  position: number
): { from: number; prefix: string } {
  const content = source.slice(braceOpen + 1, position)
  const afterComma = content.lastIndexOf(",") + 1
  const trimmed = content.slice(afterComma).trimStart()
  return { from: position - trimmed.length, prefix: trimmed }
}

/** What the cursor at `position` is completing, or `null` for ordinary prose. */
export function latexCompletionContextAt(
  source: string,
  position: number
): LatexCompletionContext | null {
  if (position < 0 || position > source.length) return null
  const lineStart = source.lastIndexOf("\n", position - 1) + 1
  if (inComment(source, lineStart, position)) return null

  let nameStart = position
  while (
    nameStart > lineStart &&
    /[A-Za-z@]/.test(source[nameStart - 1] ?? "")
  ) {
    nameStart -= 1
  }
  const prefix = source.slice(nameStart, position)

  if (
    nameStart > lineStart &&
    source[nameStart - 1] === "\\" &&
    !isEscaped(source, nameStart - 1)
  ) {
    return { kind: "command", from: nameStart - 1, prefix }
  }

  const braceOpen = enclosingBrace(source, lineStart, position)
  if (braceOpen === null) return null
  const command = owningCommand(source, lineStart, braceOpen)
  if (command === null) return null
  const { from, prefix: argument } = argumentPrefix(source, braceOpen, position)

  if (command === "begin" || command === "end") {
    return {
      kind: "environment",
      from,
      prefix: argument,
      closing: command === "end",
    }
  }
  if (PACKAGE_COMMANDS.has(command)) {
    return { kind: "package", from, prefix: argument }
  }
  if (CLASS_COMMANDS.has(command)) {
    return { kind: "document-class", from, prefix: argument }
  }
  return { kind: "argument", command, from, prefix: argument }
}

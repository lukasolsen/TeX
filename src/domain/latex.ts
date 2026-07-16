export type LatexGroup = {
  from: number
  to: number
  value: string
  kind: "optional" | "required"
}

export type LatexCommand = {
  from: number
  to: number
  name: string
  groups: LatexGroup[]
}

export type LatexFileReference = {
  from: number
  to: number
  path: string
  command: string
}

type FileCommandSpec = {
  extension: string
  groupIndex?: number
  directoryGroupIndex?: number
}

const fileCommandSpecs: Readonly<Record<string, FileCommandSpec>> = {
  input: { extension: ".tex" },
  include: { extension: ".tex" },
  subfile: { extension: ".tex" },
  bibliography: { extension: ".bib" },
  addbibresource: { extension: ".bib" },
  includegraphics: { extension: "" },
  lstinputlisting: { extension: "" },
  verbinput: { extension: "" },
  VerbatimInput: { extension: "" },
  inputminted: { extension: "", groupIndex: 1 },
  import: { extension: ".tex", groupIndex: 1, directoryGroupIndex: 0 },
  subimport: { extension: ".tex", groupIndex: 1, directoryGroupIndex: 0 },
  includefrom: { extension: ".tex", groupIndex: 1, directoryGroupIndex: 0 },
  subincludefrom: {
    extension: ".tex",
    groupIndex: 1,
    directoryGroupIndex: 0,
  },
}

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

function groupAt(
  source: string,
  position: number,
  open: "[" | "{",
  close: "]" | "}"
): { group: LatexGroup; next: number } | null {
  let depth = 1
  for (let index = position + 1; index < source.length; index += 1) {
    if (source[index] === open && !isEscaped(source, index)) depth += 1
    if (source[index] !== close || isEscaped(source, index)) continue
    depth -= 1
    if (depth === 0) {
      return {
        group: {
          from: position + 1,
          to: index,
          value: source.slice(position + 1, index),
          kind: open === "[" ? "optional" : "required",
        },
        next: index + 1,
      }
    }
  }
  return null
}

/** Scans commands and their immediate groups while ignoring comments. */
export function latexCommands(source: string): LatexCommand[] {
  const commands: LatexCommand[] = []
  let inComment = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === "\n") {
      inComment = false
      continue
    }
    if (character === "%" && !isEscaped(source, index)) {
      inComment = true
      continue
    }
    if (inComment || character !== "\\" || isEscaped(source, index)) continue

    const from = index
    index += 1
    const nameStart = index
    while (/[A-Za-z@]/.test(source[index] ?? "")) index += 1
    if (index === nameStart && index < source.length) index += 1
    const name = source.slice(nameStart, index)
    if (name === "") continue

    const groups: LatexGroup[] = []
    let cursor = index
    while (groups.length < 4) {
      while (/\s/.test(source[cursor] ?? "")) cursor += 1
      const delimiter = source[cursor]
      if (delimiter !== "[" && delimiter !== "{") break
      const parsed = groupAt(
        source,
        cursor,
        delimiter,
        delimiter === "[" ? "]" : "}"
      )
      if (parsed === null) break
      groups.push(parsed.group)
      cursor = parsed.next
    }
    commands.push({ from, to: index, name, groups })
    index -= 1
  }
  return commands
}

function normalizeProjectPath(path: string): string | null {
  const segments: string[] = []
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join("/")
}

export function resolveLatexFilePath(
  value: string,
  sourcePath: string,
  command: string
): string | null {
  const spec = fileCommandSpecs[command]
  if (spec === undefined || value.includes("\\") || value.includes("#")) {
    return null
  }
  const basename = value.replaceAll("\\", "/").split("/").at(-1) ?? value
  const name =
    spec.extension !== "" && !basename.includes(".")
      ? `${value}${spec.extension}`
      : value
  const directory = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
    : ""
  return normalizeProjectPath(directory === "" ? name : `${directory}/${name}`)
}

export function latexFileReferences(
  source: string,
  sourcePath: string
): LatexFileReference[] {
  const references: LatexFileReference[] = []
  for (const command of latexCommands(source)) {
    const spec = fileCommandSpecs[command.name]
    if (spec === undefined) continue
    const requiredGroups = command.groups.filter(
      ({ kind }) => kind === "required"
    )
    const group = requiredGroups[spec.groupIndex ?? 0]
    if (group === undefined) continue
    const directory =
      spec.directoryGroupIndex === undefined
        ? ""
        : (requiredGroups[spec.directoryGroupIndex]?.value.trim() ?? "")
    let offset = 0
    for (const rawValue of group.value.split(",")) {
      const leading = rawValue.length - rawValue.trimStart().length
      const value = rawValue.trim()
      const combinedValue =
        directory === ""
          ? value
          : `${directory}${directory.endsWith("/") ? "" : "/"}${value}`
      const path = resolveLatexFilePath(combinedValue, sourcePath, command.name)
      if (value !== "" && path !== null) {
        const from = group.from + offset + leading
        references.push({
          from,
          to: from + value.length,
          path,
          command: command.name,
        })
      }
      offset += rawValue.length + 1
    }
  }
  return references
}

export function latexFileReferenceAt(
  source: string,
  sourcePath: string,
  position: number
): LatexFileReference | null {
  return (
    latexFileReferences(source, sourcePath).find(
      ({ from, to }) => position >= from && position < to
    ) ?? null
  )
}
